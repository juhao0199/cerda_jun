from django.db import transaction
from django.db.models import Q
from django.views.decorators.http import require_GET
from django.utils import timezone
from apps.accounts.models import AccountSecurity
from apps.accounts.security import audit
from apps.accounts.views import fail, require_role
from apps.inquiries.crm import locked_role
from .models import ContentTask, TopicCluster, ContentOpportunity, Post, SlugAlias, PublishingPlan, WebsiteContent
from .operations_rules import task_fields, cluster_fields, ident, health, choice, STAGES
from .content import text, normalize, slug_value, STARTER_PLACEHOLDER
from .editorial import editorial_lock, validate_terms
from .website_rules import effective
from .website_content import response
from . import views


def cluster_row(c):
    return {'id':c.pk,'version':c.version,'name':c.name,'keyword':c.keyword,'market':c.market,'intent':c.intent,'keywords':c.keywords,'notes':c.notes,'archived':c.archived}


def task_row(t, plans=None):
    p=t.opportunity.post if t.opportunity_id else t.post
    plan=(plans or {}).get(p.pk) if p else None
    release='unlinked'
    if p:
        release='published' if p.status=='published' and p.draft==p.published else p.status if p.status!='published' else 'unpublished edits'
        if plan and plan.status in ('review','returned','approved','scheduled','stale'):
            release='stale' if plan.target_version!=p.version else plan.status
    return {'id':t.pk,'version':t.version,'title':t.title,'stage':t.stage,'priority':t.priority,'keyword':t.keyword,'audience':t.audience,'intent':t.intent,'brief':t.brief,'outline':t.outline,'due':t.due.isoformat() if t.due else None,'assigneeId':t.assignee_id,'clusterId':t.cluster_id,'opportunityId':t.opportunity_id,'sourceTitle':t.opportunity.title if t.opportunity_id else '', 'postSlug':p.slug if p else '', 'release':release,'planId':plan.pk if plan else None,'scheduledAt':plan.scheduled_at.isoformat() if plan and release=='scheduled' and plan.scheduled_at else None}


def task_query():
    return ContentTask.objects.select_related('post','opportunity__post')


def rows(tasks):
    ids={p.pk for t in tasks for p in [t.opportunity.post if t.opportunity_id else t.post] if p}
    plans={}
    for p in PublishingPlan.objects.filter(post_id__in=ids,status__in=['review','returned','approved','scheduled','stale']).order_by('pk'):
        plans[p.post_id]=p
    return [task_row(t,plans) for t in tasks]


def members():
    return AccountSecurity.objects.filter(role__in=['owner','staff'],user__is_active=True).select_related('user').order_by('user__username')


@require_GET
@require_role('owner','staff')
def listing(request):
    try:
        if set(request.GET)-{'q','page','stage','cluster'}: raise ValueError()
        q=text(request.GET.get('q',''),100); page=int(request.GET.get('page','1')); stage=choice(request.GET.get('stage','all'),('all',*STAGES)); cluster=int(request.GET.get('cluster','0'))
        if not 1<=page<=1000 or not 0<=cluster<2**53: raise ValueError()
    except (ValueError,UnicodeError): return fail('Invalid content filters.',400)
    base=task_query()
    if stage=='all': base=base.exclude(stage='archived')
    else: base=base.filter(stage=stage)
    if cluster: base=base.filter(cluster_id=cluster)
    if q: base=base.filter(Q(title__icontains=q)|Q(keyword__icontains=q)|Q(audience__icontains=q))
    tasks=list(base.order_by('-updated_at','-pk')[(page-1)*100:page*100+1])
    clusters=list(TopicCluster.objects.order_by('archived','name','pk')[:201])
    people=list(members()[:201])
    return response({'tasks':rows(tasks[:100]),'hasMore':len(tasks)>100,'clusters':[cluster_row(c) for c in clusters[:200]],'clustersTruncated':len(clusters)>200,'members':[{'id':p.user_id,'name':p.user.get_username()} for p in people[:200]],'membersTruncated':len(people)>200})


@views.blog_post
@require_role('owner','staff')
def change_cluster(request,data):
    try:
        if set(data)!={'id','version','fields'}: raise ValueError('Invalid request.')
        pk=ident(data['id'],True); version=ident(data['version'],True); fields=cluster_fields(data['fields'])
        if (pk is None)!=(version is None): raise ValueError('Invalid version.')
    except (ValueError,UnicodeError,TypeError): return fail('Invalid cluster fields.',400)
    with transaction.atomic():
        if not locked_role(request): return fail('Access denied.',403)
        if pk is None: c=TopicCluster.objects.create(**fields)
        else:
            c=TopicCluster.objects.select_for_update().filter(pk=pk).first()
            if not c: return fail('Cluster not found.',404)
            if c.version!=version: return fail('Cluster changed. Reload before saving.',409)
            for k,v in fields.items(): setattr(c,k,v)
            c.version+=1;c.save()
        audit('content.cluster.save',request.user,subject=str(c.pk))
        return response(cluster_row(c))


@views.blog_post
@require_role('owner','staff')
def change_task(request,data):
    try:
        action=choice(data.get('action'),('save','move','import','link','draft'))
        expected={'action','id','version'}|{'save':{'fields'},'move':{'stage','due'},'import':{'opportunityId'},'link':{'slug'},'draft':{'slug','category','summary'}}[action]
        if set(data)!=expected: raise ValueError('Invalid request.')
        pk=ident(data['id'],True); version=ident(data['version'],True)
        if (pk is None)!=(version is None) or (pk is None and action not in ('save','import')) or (action=='import' and pk is not None): raise ValueError('Invalid version.')
        if action=='save': fields=task_fields(data['fields'])
        if action=='move':
            stage=choice(data['stage'],STAGES); due=data['due']
            if due is not None:
                from datetime import date
                if not isinstance(due,str) or len(due)!=10: raise ValueError()
                due=date.fromisoformat(due)
                if not 2000<=due.year<=2100: raise ValueError()
        if action=='import': source=ident(data['opportunityId'])
        if action in ('link','draft'): slug=slug_value(data['slug'])
        if action=='draft': category=text(data['category'],60,1); summary=text(data['summary'],320,1)
    except (ValueError,TypeError,UnicodeError): return fail('Invalid content task fields.',400)
    with transaction.atomic():
        if not locked_role(request): return fail('Access denied.',403)
        # Same lock order as article and opportunity creation; no public release here.
        if action in ('import','link','draft'): editorial_lock()
        if pk is not None:
            t=ContentTask.objects.select_for_update().filter(pk=pk).first()
            if not t: return fail('Task not found.',404)
            if t.version!=version: return fail('Task changed. Reload before saving.',409)
        if action=='save':
            if fields['cluster_id'] and not TopicCluster.objects.filter(pk=fields['cluster_id']).exists(): return fail('Cluster not found.',400)
            if fields['assignee_id'] and not members().filter(user_id=fields['assignee_id']).exists(): return fail('Choose an active staff member.',400)
            if pk is None: t=ContentTask.objects.create(actor_id=request.user.pk,**fields)
            else:
                for k,v in fields.items(): setattr(t,k,v)
        elif action=='import':
            gap=ContentOpportunity.objects.select_for_update().filter(pk=source).first()
            if not gap or gap.status not in ('open','in_progress'): return fail('Open opportunity not found.',404)
            if ContentTask.objects.filter(opportunity=gap).exists(): return fail('Opportunity already imported.',409)
            t=ContentTask.objects.create(title=gap.title,brief=gap.brief,priority=gap.priority,opportunity=gap,actor_id=request.user.pk,stage='research')
        elif action=='move': t.stage=stage;t.due=due
        elif action in ('link','draft'):
            gap=ContentOpportunity.objects.select_for_update().filter(pk=t.opportunity_id).first() if t.opportunity_id else None
            if t.post_id or (gap and gap.post_id): return fail('Task already has linked content.',409)
            if gap and gap.status not in ('open','in_progress'): return fail('Opportunity is closed.',409)
            if action=='link':
                post=Post.objects.select_for_update().filter(slug=slug).exclude(status='archived').first()
                if not post: return fail('Article not found.',404)
            else:
                if Post.objects.filter(slug=slug).exists() or SlugAlias.objects.filter(slug=slug).exists(): return fail('Slug already exists or is reserved.',409)
                try:
                    fields=normalize({'title':t.title,'summary':summary,'category':category,'tags':[],'sections':[{'heading':'Draft placeholder','body':STARTER_PLACEHOLDER}],'seoTitle':'','seoDescription':'','cover':'','focusKeyword':t.keyword})
                    validate_terms(fields)
                except (ValueError,UnicodeError) as e: return fail(str(e),400)
                post=Post.objects.create(slug=slug,draft=fields);views.record(post,'create',request.user)
            if gap:
                if ContentOpportunity.objects.filter(post=post).exists(): return fail('Article already linked to an opportunity.',409)
                gap.post=post;gap.status='in_progress';gap.version+=1;gap.save(update_fields=['post','status','version'])
            else: t.post=post
            t.stage='writing'
        if pk is not None: t.version+=1;t.save()
        audit('content.task.'+action,request.user,subject=str(t.pk))
        return response(rows([task_query().get(pk=t.pk)])[0])


@require_GET
@require_role('owner','staff')
def health_report(request):
    # Bounded published metadata review; no search rankings or traffic estimates.
    articles=list(Post.objects.filter(status='published',published__isnull=False).order_by('pk')[:201])
    site=WebsiteContent.objects.filter(pk=1).first(); f=effective(site.published if site else None)
    values=[{'path':path,'title':f[prefix+'Title'],'description':f[prefix+'Description'],'keyword':'','modified':site.published_at.date() if site and site.published_at else None} for path,prefix in [('/','home'),('/blog','blog')]]
    for p in articles[:200]:
        d=p.published; modified=p.published_modified_at or p.published_at
        values.append({'path':'/blog/'+p.slug,'title':d.get('seoTitle') or d['title'],'description':d.get('seoDescription') or d['summary'],'keyword':d.get('focusKeyword',''),'modified':modified.date() if modified else None})
    return response({'sampled':len(values),'truncated':len(articles)>200,'results':health(values,timezone.now().date())})
