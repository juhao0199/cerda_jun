"""Role protected technical audit and crawler policy endpoints."""
import json
from django.conf import settings
from django.db import connection, transaction
from django.http import HttpResponse, JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit, reserve_attempt
from apps.inquiries.crm import locked_role
from .crawler_policy import AGENTS, render_robots, valid_policy
from .models import CrawlerPolicy, SiteAudit, Post
from .site_audit import run_audit, origin, PAGE_SIZE


def policy_row(obj):
    return {'version': str(obj.version), 'directives': obj.directives, 'agents': AGENTS,
            'robots': render_robots(obj.directives, settings.SITE_ORIGIN), 'updatedAt': obj.updated_at.isoformat()}


@require_GET
@require_role('owner','staff')
def policy(request):
    return JsonResponse(policy_row(CrawlerPolicy.objects.get(pk=1)))


@json_post
@require_role('owner')
def change_policy(request, data):
    if set(data) != {'version','directives'} or not isinstance(data['version'],str) or not data['version'].isascii() or not data['version'].isdigit() or len(data['version'])>19:
        return fail('Invalid policy request.',400)
    try: directives=json.loads(data['directives']) if isinstance(data['directives'],str) else None
    except (ValueError, RecursionError): directives=None
    if not valid_policy(directives): return fail('Invalid crawler directives.',400)
    with transaction.atomic():
        if locked_role(request) != 'owner': return fail('Access denied.',403)
        obj=CrawlerPolicy.objects.select_for_update().get(pk=1)
        if str(obj.version)!=data['version']: return fail('Policy changed. Reload before saving.',409)
        if obj.directives!=directives:
            obj.directives=directives;obj.version+=1;obj.save(update_fields=['directives','version','updated_at'])
            audit('blog.crawler.change',request.user,subject=str(obj.version))
        return JsonResponse(policy_row(obj))


@require_GET
def public_robots(request):
    try: body=render_robots(CrawlerPolicy.objects.get(pk=1).directives,settings.SITE_ORIGIN)
    except (CrawlerPolicy.DoesNotExist,ValueError): return HttpResponse('Robots policy unavailable.\n',status=503,content_type='text/plain; charset=utf-8')
    return HttpResponse(body,content_type='text/plain; charset=utf-8')


def summary(obj):
    r=obj.report
    return {'id':str(obj.pk),'recordedAt':obj.created_at.isoformat(),'site':r['site'],'offset':r['offset'],'pages':len(r['pages']),
            'issues':sum(len(p['issues']) for p in r['pages']), 'linksChecked':r['linksChecked']}


@require_GET
@require_role('owner','staff')
def history(request):
    return JsonResponse({'results':[summary(r) for r in SiteAudit.objects.order_by('-created_at','-id')[:30]]})


@require_GET
@require_role('owner','staff')
def detail(request, audit_id):
    if not 0<audit_id<2**63: return fail('Report not found.',404)
    obj=SiteAudit.objects.filter(pk=audit_id).first()
    return JsonResponse({**summary(obj),'report':obj.report}) if obj else fail('Report not found.',404)


@json_post
@require_role('owner')
def run(request,data):
    if set(data)!={'offset'} or not isinstance(data['offset'],str) or not data['offset'].isascii() or not data['offset'].isdigit() or len(data['offset'])>5:
        return fail('Invalid audit offset.',400)
    offset=int(data['offset'])
    if offset%PAGE_SIZE: return fail('Invalid audit offset.',400)
    target=settings.SITE_AUDIT_ORIGIN
    try: origin(target); origin(settings.SITE_ORIGIN)
    except ValueError: return fail('Audit origin is not configured correctly.',503)
    # One scan across all workers. Session lock is explicitly released; no transaction held across HTTP.
    with connection.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(%s)',[19430071]); acquired=cur.fetchone()[0]
    if not acquired: return fail('An audit is already running.',409)
    try:
        with transaction.atomic():
            if locked_role(request)!='owner': return fail('Access denied.',403)
        if not reserve_attempt('technical-audit','site','site'): return fail('Audit limit reached. Try again later.',429)
        config=CrawlerPolicy.objects.get(pk=1)
        inventory=['/','/blog','/privacy']+['/blog/'+p for p in Post.objects.filter(status='published',published__isnull=False,published_at__isnull=False).values_list('slug',flat=True)]
        report=run_audit(target,settings.SITE_ORIGIN,render_robots(config.directives,settings.SITE_ORIGIN),inventory,offset)
        report['policyVersion']=str(config.version)
        with transaction.atomic():
            if locked_role(request)!='owner': return fail('Access denied.',403)
            obj=SiteAudit.objects.create(actor_id=request.user.pk,report=report)
            audit('blog.technical.run',request.user,subject=str(obj.pk))
        return JsonResponse({**summary(obj),'report':report},status=201)
    finally:
        with connection.cursor() as cur: cur.execute('SELECT pg_advisory_unlock(%s)',[19430071])
