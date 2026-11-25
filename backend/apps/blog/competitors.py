"""Private paired observations and editorial action queue. Never fetch competitor URLs."""
from datetime import timedelta
import uuid
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role, pagination
from .content import text, normalize, slug_value
from .competitor_rules import domain, matched_sources, pair_stats
from .editorial import editorial_lock, validate_terms
from .models import Competitor, CompetitorObservation, ContentOpportunity, TrackedPrompt, PromptMeasurement, Post, SlugAlias
from .monitoring_rules import ENGINES, OUTCOMES
from .prompt_monitoring import valid_id
from .views import record


def strings(data, keys):
    if set(data)!=set(keys.split()) or not all(isinstance(v,str) for v in data.values()):
        raise ValueError('Invalid request fields.')


def cid(value):
    if not valid_id(value): raise ValueError('Invalid ID or version.')
    return int(value)


def mid(value):
    value=uuid.UUID(value)
    if value.version!=4: raise ValueError('Invalid measurement ID.')
    return value


def competitor_row(c):
    return {'id':str(c.pk),'name':c.name,'domain':c.domain,'market':c.market,'kind':c.kind,'active':c.active,'version':str(c.version)}


def obs_row(o):
    m=o.measurement
    return {'id':str(o.pk),'measurementId':str(m.pk),'promptId':str(m.prompt_id),'question':m.prompt.question,'engine':m.engine,
            'observedAt':m.observed_at.isoformat(),'context':m.context,'ownBrand':m.brand,'ownCitation':m.citation,
            'brand':o.brand,'sources':o.cited_sources,'evidence':o.evidence,'recordedAt':o.created_at.isoformat()}


def gap_row(g):
    return {'id':str(g.pk),'promptId':str(g.prompt_id),'question':g.prompt.question,'measurementId':str(g.measurement_id or ''),
            'competitorId':str(g.competitor_id or ''),'competitor':g.competitor.name if g.competitor_id else '',
            'title':g.title,'brief':g.brief,'target':g.target,'priority':g.priority,'status':g.status,'version':str(g.version),
            'postSlug':g.post.slug if g.post_id else '', 'postStatus':g.post.status if g.post_id else ''}


@require_GET
@require_role('owner','staff')
def listing(request):
    parsed=pagination(request,{'q','page','status'})
    status=request.GET.get('status','active')
    if parsed is None or status not in ('active','archived','all'): return fail('Invalid filters.',400)
    page,q=parsed; qs=Competitor.objects.all()
    if status!='all': qs=qs.filter(active=status=='active')
    if q: qs=qs.filter(Q(name__icontains=q)|Q(domain__icontains=q)|Q(market__icontains=q))
    rows=list(qs.order_by('name','id')[(page-1)*20:page*20+1])
    return JsonResponse({'results':[competitor_row(c) for c in rows[:20]],'hasMore':len(rows)>20})


@json_post
@require_role('owner')
def create(request,data):
    try:
        strings(data,'name domain market'); name=text(data['name'],100,1); host=domain(data['domain']); market=text(data['market'],80,1)
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    try:
        with transaction.atomic():
            if locked_role(request)!='owner': return fail('Access denied.',403)
            c=Competitor.objects.create(name=name,domain=host,market=market,actor_id=request.user.pk)
            audit('blog.competitor.create',request.user,subject=str(c.pk))
            return JsonResponse(competitor_row(c),status=201)
    except IntegrityError: return fail('Domain already registered.',409)


@json_post
@require_role('owner')
def change(request,data):
    try:
        strings(data,'id version action'); pk=cid(data['id']); version=cid(data['version'])
        if data['action'] not in ('archive','restore'): raise ValueError('Invalid action.')
    except ValueError as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request)!='owner': return fail('Access denied.',403)
        c=Competitor.objects.select_for_update().filter(pk=pk).first()
        if not c: return fail('Competitor not found.',404)
        if c.version!=version: return fail('Competitor changed. Refresh.',409)
        c.active=data['action']=='restore'; c.version+=1; c.save(update_fields=['active','version'])
        audit('blog.competitor.'+data['action'],request.user,subject=str(c.pk))
        return JsonResponse(competitor_row(c))


@require_GET
@require_role('owner','staff')
def benchmark(request):
    parsed=pagination(request,{'id','page','days','engine','prompt'})
    days=request.GET.get('days','30'); engine=request.GET.get('engine',''); prompt=request.GET.get('prompt',''); pk=request.GET.get('id','')
    if parsed is None or not valid_id(pk) or days not in ('30','90','all') or engine not in ('',*ENGINES) or (prompt and not valid_id(prompt)):
        return fail('Invalid benchmark filters.',400)
    c=Competitor.objects.filter(pk=pk).first()
    if not c: return fail('Competitor not found.',404)
    qs=c.observations.all()
    if days!='all': qs=qs.filter(measurement__observed_at__gte=timezone.now()-timedelta(days=int(days)))
    if engine: qs=qs.filter(measurement__engine=engine)
    if prompt: qs=qs.filter(measurement__prompt_id=prompt)
    # Bounded read for analytics. Never quietly truncate the denominator.
    sample=list(qs.order_by('-measurement__observed_at','-id').values_list('measurement__brand','brand','measurement__citation','cited_sources')[:10001])
    stats=pair_stats(sample) if len(sample)<=10000 else None
    page,_=parsed; rows=list(qs.select_related('measurement__prompt').order_by('-measurement__observed_at','-id')[(page-1)*20:page*20+1])
    return JsonResponse({'competitor':competitor_row(c),'metrics':stats,'results':[obs_row(o) for o in rows[:20]],'hasMore':len(rows)>20})


@json_post
@require_role('owner','staff')
def observe(request,data):
    try:
        strings(data,'id measurementId brand evidence'); pk=cid(data['id']); measurement=mid(data['measurementId']); evidence=text(data['evidence'],1000,1)
        if data['brand'] not in OUTCOMES: raise ValueError('Invalid brand outcome.')
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    try:
        with transaction.atomic():
            if locked_role(request) not in ('owner','staff'): return fail('Access denied.',403)
            c=Competitor.objects.select_for_update().filter(pk=pk).first()
            m=PromptMeasurement.objects.select_related('prompt').filter(pk=measurement).first()
            if not c or not m: return fail('Competitor or measurement not found.',404)
            if not c.active: return fail('Competitor is archived.',409)
            o=CompetitorObservation.objects.create(competitor=c,measurement=m,brand=data['brand'],cited_sources=matched_sources(c.domain,m.sources),evidence=evidence,actor_id=request.user.pk)
            audit('blog.competitor.observe',request.user,subject=str(o.pk))
            return JsonResponse(obs_row(o),status=201)
    except IntegrityError: return fail('Competitor already observed in this measurement.',409)


@require_GET
@require_role('owner','staff')
def gaps(request):
    parsed=pagination(request,{'q','page','status'}); status=request.GET.get('status','all')
    if parsed is None or status not in ('all','open','in_progress','done','dismissed'): return fail('Invalid opportunity filters.',400)
    page,q=parsed; qs=ContentOpportunity.objects.select_related('prompt','competitor','post')
    if status!='all': qs=qs.filter(status=status)
    if q: qs=qs.filter(Q(title__icontains=q)|Q(prompt__question__icontains=q))
    rows=list(qs.order_by('-created_at','-id')[(page-1)*20:page*20+1])
    return JsonResponse({'results':[gap_row(g) for g in rows[:20]],'hasMore':len(rows)>20})


@json_post
@require_role('owner','staff')
def create_gap(request,data):
    try:
        strings(data,'promptId measurementId competitorId title brief target priority'); pid=cid(data['promptId']); measurement=mid(data['measurementId']) if data['measurementId'] else None; competitor=cid(data['competitorId']) if data['competitorId'] else None
        title=text(data['title'],160,1); brief=text(data['brief'],1500,1); target=text(data['target'],160)
        if data['priority'] not in ('high','medium','low'): raise ValueError('Invalid priority.')
        if target and target not in ('/','/blog','/privacy') and not (target.startswith('/blog/') and slug_value(target[6:])): raise ValueError('Use a public site path.')
        if competitor and not measurement: raise ValueError('A competitor gap requires a paired measurement.')
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request) not in ('owner','staff'): return fail('Access denied.',403)
        p=TrackedPrompt.objects.filter(pk=pid).first()
        if not p: return fail('Prompt not found.',404)
        if measurement and not PromptMeasurement.objects.filter(pk=measurement,prompt=p).exists(): return fail('Measurement does not belong to this prompt.',400)
        if competitor and not CompetitorObservation.objects.filter(competitor_id=competitor,measurement_id=measurement).exists(): return fail('No paired competitor evidence.',400)
        g=ContentOpportunity.objects.create(prompt=p,measurement_id=measurement,competitor_id=competitor,title=title,brief=brief,target=target,priority=data['priority'],actor_id=request.user.pk)
        audit('blog.opportunity.create',request.user,subject=str(g.pk))
        return JsonResponse(gap_row(g),status=201)


@json_post
@require_role('owner','staff')
def change_gap(request,data):
    try:
        strings(data,'id version status'); pk=cid(data['id']); version=cid(data['version'])
        if data['status'] not in ('open','in_progress','done','dismissed'): raise ValueError('Invalid status.')
    except ValueError as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request) not in ('owner','staff'): return fail('Access denied.',403)
        g=ContentOpportunity.objects.select_for_update().filter(pk=pk).first()
        if not g: return fail('Opportunity not found.',404)
        if g.version!=version: return fail('Opportunity changed. Refresh.',409)
        g.status=data['status']; g.version+=1; g.save(update_fields=['status','version'])
        audit('blog.opportunity.status',request.user,subject=str(g.pk))
        return JsonResponse(gap_row(g))


@json_post
@require_role('owner','staff')
def draft(request,data):
    try:
        strings(data,'id version slug title summary category body'); pk=cid(data['id']); version=cid(data['version']); slug=slug_value(data['slug'])
        fields=normalize({'title':data['title'],'summary':data['summary'],'category':data['category'],'tags':[],
                          'sections':[{'heading':'Overview','body':data['body']}],'seoTitle':'','seoDescription':'','cover':''})
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request) not in ('owner','staff'): return fail('Access denied.',403)
        editorial_lock()
        g=ContentOpportunity.objects.select_for_update().filter(pk=pk).first()
        if not g: return fail('Opportunity not found.',404)
        if g.version!=version or g.post_id or g.status not in ('open','in_progress'): return fail('Opportunity changed, closed, or already linked to a draft.',409)
        if Post.objects.filter(slug=slug).exists() or SlugAlias.objects.filter(slug=slug).exists(): return fail('Slug already exists or is reserved.',409)
        try: validate_terms(fields)
        except ValueError as e: return fail(str(e),400)
        post=Post.objects.create(slug=slug,draft=fields)
        record(post,'create',request.user)
        g.post=post; g.status='in_progress'; g.version+=1; g.save(update_fields=['post','status','version'])
        audit('blog.opportunity.draft',request.user,subject=str(g.pk))
        return JsonResponse(gap_row(g),status=201)


@require_GET
@require_role('owner','staff')
def coverage(request):
    from .competitor_rules import visible_text
    parsed=pagination(request,{'q'})
    if parsed is None or not parsed[1]: return fail('Enter a content phrase.',400)
    phrase=' '.join(parsed[1].casefold().split())
    rows=list(Post.objects.filter(status='published',published__isnull=False,published_at__isnull=False).order_by('id').values('slug','published')[:201])
    matches=[{'slug':r['slug'],'title':r['published']['title']} for r in rows[:200] if phrase in visible_text(r['published'])]
    return JsonResponse({'scanned':min(len(rows),200),'complete':len(rows)<=200,'matchCount':len(matches),'results':matches[:50],'matchesTruncated':len(matches)>50})
