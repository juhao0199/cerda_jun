"""Owner-triggered scanning; staff can review immutable reports."""
from django.conf import settings
from django.db import connection, transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit, reserve_attempt
from apps.inquiries.crm import locked_role
from .competitors import strings, cid, competitor_row
from .models import Competitor, CompetitorIntelligence, Post
from .competitor_rules import visible_text
from .intelligence_engine import published_headings
from .intelligence_engine import scan
from .intelligence_pro import VERSION, OWN_SECTIONS, own_section_matches, historical_delta
from django.db.models import Q

KINDS=('unclassified','direct','indirect','reference')


def summary(obj):
    return {'id':str(obj.pk),'competitorId':str(obj.competitor_id),'recordedAt':obj.created_at.isoformat(),
            'state':obj.report['state'],'measured':obj.report.get('measured',0),'discovered':obj.report['discovered']}


def detail_payload(obj):
    payload={**summary(obj),'report':obj.report}
    if obj.report.get('analysisVersion')!=VERSION or not obj.report.get('measured'):return payload
    older=CompetitorIntelligence.objects.filter(competitor_id=obj.competitor_id).filter(
        Q(created_at__lt=obj.created_at)|Q(created_at=obj.created_at,id__lt=obj.pk)).order_by('-created_at','-id')[:20]
    for prev in older:
        delta=historical_delta(obj.report,prev.report)
        if delta is not None:
            payload['delta']={**delta,'previousId':str(prev.pk),'previousAt':prev.created_at.isoformat()}
            break
    return payload


@require_GET
@require_role('owner','staff')
def history(request):
    try:
        if set(request.GET)!={'id'}:raise ValueError()
        pk=cid(request.GET['id'])
    except ValueError:return fail('Invalid competitor ID.',400)
    c=Competitor.objects.filter(pk=pk).first()
    if not c:return fail('Competitor not found.',404)
    return JsonResponse({'competitor':competitor_row(c),'enabled':settings.COMPETITOR_INTELLIGENCE_ENABLED,'results':[summary(r) for r in c.intelligence_reports.order_by('-created_at','-id')[:20]]})


@require_GET
@require_role('owner','staff')
def detail(request):
    try:
        if set(request.GET)!={'id','report'}:raise ValueError()
        pk=cid(request.GET['id']);report=cid(request.GET['report'])
    except ValueError:return fail('Invalid report ID.',400)
    obj=CompetitorIntelligence.objects.filter(pk=report,competitor_id=pk).first()
    return JsonResponse(detail_payload(obj)) if obj else fail('Report not found.',404)


@json_post
@require_role('owner')
def classify(request,data):
    try:
        strings(data,'id version kind');pk=cid(data['id']);version=cid(data['version']);kind=data['kind']
        if kind not in KINDS:raise ValueError('Invalid competitor type.')
    except ValueError as e:return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request)!='owner':return fail('Access denied.',403)
        c=Competitor.objects.select_for_update().filter(pk=pk).first()
        if not c:return fail('Competitor not found.',404)
        if c.version!=version:return fail('Competitor changed. Refresh.',409)
        if c.kind!=kind:
            c.kind=kind;c.version+=1;c.save(update_fields=['kind','version']);audit('blog.competitor.classify',request.user,subject=str(c.pk))
        return JsonResponse(competitor_row(c))


@json_post
@require_role('owner')
def run(request,data):
    try:
        strings(data,'id variant');pk=cid(data['id']);variant=data['variant']
        if variant not in ('apex','www'):raise ValueError('Invalid host variant.')
    except ValueError as e:return fail(str(e),400)
    if not settings.COMPETITOR_INTELLIGENCE_ENABLED:return fail('External scanning is disabled in this deployment.',503)
    # Global cross-worker lock and rate limit; never hold a DB transaction over network I/O.
    with connection.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(%s)',[19450101]); acquired=cur.fetchone()[0]
    if not acquired:return fail('A competitor scan is already running.',409)
    try:
        with transaction.atomic():
            if locked_role(request)!='owner':return fail('Access denied.',403)
            c=Competitor.objects.filter(pk=pk,active=True).first()
            if not c:return fail('Active competitor not found.',404)
        if not reserve_attempt('competitor-intelligence','global','global'):return fail('Scan limit reached. Try again later.',429)
        report=scan(c.domain,variant)
        with transaction.atomic():
            if locked_role(request)!='owner':return fail('Access denied.',403)
            if not Competitor.objects.filter(pk=pk,active=True).exists():return fail('Competitor archived during scan.',409)
            obj=CompetitorIntelligence.objects.create(competitor=c,actor_id=request.user.pk,report=report)
            audit('blog.competitor.intelligence',request.user,subject=str(obj.pk))
        return JsonResponse(detail_payload(obj),status=201)
    finally:
        with connection.cursor() as cur:cur.execute('SELECT pg_advisory_unlock(%s)',[19450101])


@require_GET
@require_role('owner','staff')
def compare(request):
    """Lexical heading/title match, not an SEO ranking or a full site comparison."""
    try:
        if set(request.GET)!={'id','report','q'}:raise ValueError()
        pk=cid(request.GET['id']);rid=cid(request.GET['report']);phrase=' '.join(request.GET['q'].casefold().split())
        if not 2<=len(phrase)<=100:raise ValueError()
    except ValueError:return fail('Enter a phrase of 2–100 characters.',400)
    obj=CompetitorIntelligence.objects.filter(pk=rid,competitor_id=pk).first()
    if not obj:return fail('Report not found.',404)
    measured=[p for p in obj.report['pages'] if p['measured']]
    others=[{'path':p['path'],'title':p['title']} for p in measured if phrase in ' '.join((' '.join([p['title']]+[h['text'] for h in p['headings']])).casefold().split())]
    rows=list(Post.objects.filter(status='published',published__isnull=False,published_at__isnull=False).order_by('id').values('slug','published')[:201])
    own=[{'slug':r['slug'],'title':r['published']['title']} for r in rows[:200] if phrase in published_headings(r['published'])]
    own_body=sum(phrase in visible_text(r['published']) for r in rows[:200])
    return JsonResponse({'competitorScanned':len(measured),'competitorMatches':others,'ownScanned':min(200,len(rows)),'ownMatches':own[:50],'ownMatchCount':len(own),'ownBodyMatchCount':own_body,'ownComplete':len(rows)<=200,'ownSectionCount':len(OWN_SECTIONS),'ownSectionMatches':own_section_matches(phrase),'ownSectionScope':'Curated local homepage section labels and headings; not a live or complete site scan.'})
