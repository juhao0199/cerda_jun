"""Internal manually recorded search observations. No outbound requests."""
import re
from django.db import transaction
from django.db.models import Count
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role, pagination
from .content import text
from .models import DiscoveryObservation, Post

ENGINES = {'Google Search', 'Google AI Overviews', 'Bing', 'ChatGPT Search', 'Gemini', 'Perplexity', 'Microsoft Copilot', 'Other'}
MODES = {'aeo', 'geo'}
OUTCOMES = {'present', 'absent', 'inconclusive'}


def row(o):
    return {'id': str(o.pk), 'mode': o.mode, 'engine': o.engine, 'prompt': o.prompt, 'target': o.target,
            'outcome': o.outcome, 'evidence': o.evidence, 'recordedAt': o.created_at.isoformat()}


@require_GET
@require_role('owner','staff')
def listing(request):
    parsed = pagination(request, {'page','mode'})
    mode = request.GET.get('mode','')
    if parsed is None or mode not in MODES: return fail('Invalid observation filters.',400)
    page,_ = parsed
    qs = DiscoveryObservation.objects.filter(mode=mode)
    counts = {x['outcome']:x['count'] for x in qs.values('outcome').annotate(count=Count('id'))}
    start = (page-1)*20
    rows = list(qs.order_by('-created_at','-id')[start:start+21])
    return JsonResponse({'results':[row(o) for o in rows[:20]], 'page':page,'hasMore':len(rows)>20,
                         'counts':{k:counts.get(k,0) for k in sorted(OUTCOMES)}})


@json_post
@require_role('owner','staff')
def create(request, data):
    try:
        if set(data) != {'mode','engine','prompt','target','outcome','evidence'} or not all(isinstance(v,str) for v in data.values()): raise ValueError('Invalid observation.')
        mode,engine,outcome=data['mode'],data['engine'],data['outcome']
        if mode not in MODES or engine not in ENGINES or outcome not in OUTCOMES: raise ValueError('Invalid observation choice.')
        prompt=text(data['prompt'],500,1);target=text(data['target'],160,1);evidence=text(data['evidence'],1500,1)
        if target not in ('/','/blog','/privacy'):
            if not re.fullmatch(r'/blog/[a-z0-9]+(?:-[a-z0-9]+)*',target) or len(target)>106: raise ValueError('Choose a site path or current article URL.')
            if not Post.objects.filter(slug=target[6:]).exists(): raise ValueError('Article not found.')
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request) not in ('owner','staff'): return fail('Access denied.',403)
        obj=DiscoveryObservation.objects.create(mode=mode,engine=engine,outcome=outcome,prompt=prompt,target=target,evidence=evidence,actor_id=request.user.pk)
        audit('blog.discovery.record',request.user,subject=str(obj.pk))
        return JsonResponse(row(obj),status=201)
