"""Editorial vocabulary and reserved URL namespace. Snapshots retain display names."""
from django.db import connection, transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, json_post, require_role
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role, pagination
from .content import text
from .models import EditorialTerm, Post

KINDS = {'category': 60, 'tag': 40, 'author': 80}


def editorial_lock():
    # PostgreSQL transaction-scoped lock: all slug and vocabulary mutations use it.
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_xact_lock(%s)', [194003])


def validate_terms(fields, previous=None):
    previous = previous or {}
    entries = [('category', fields['category']), *[('tag', t) for t in fields['tags']]]
    if fields.get('author'):
        entries.append(('author', fields['author']))
    prior = {('category', previous.get('category', '').casefold()),
             *[('tag', t.casefold()) for t in previous.get('tags', [])],
             ('author', previous.get('author', '').casefold())}
    new = []
    canonical = {}
    for kind, name in entries:
        key = name.casefold()
        term = EditorialTerm.objects.filter(kind=kind, key=key).first()
        if term and not term.active and (kind, key) not in prior:
            raise ValueError('A selected editorial term is archived. Choose an active term.')
        if term:
            canonical[(kind,key)] = term.name
        elif kind == 'author':
            raise ValueError('Select an author from the editorial directory.')
        else:
            new.append(EditorialTerm(kind=kind, key=key, name=name))
            canonical[(kind,key)] = name
    # Legacy free-text category/tag inputs remain supported and register vocabulary on save.
    EditorialTerm.objects.bulk_create(new)
    fields['category'] = canonical[('category',fields['category'].casefold())]
    fields['tags'] = [canonical[('tag',t.casefold())] for t in fields['tags']]
    if fields.get('author'):
        fields['author'] = canonical[('author',fields['author'].casefold())]


def term_row(t):
    return {'id':str(t.pk), 'kind':t.kind, 'name':t.name, 'active':t.active, 'version':t.version}


@require_GET
@require_role('owner','staff')
def terms(request):
    parsed = pagination(request, {'page','q','kind','active'})
    kind, active = request.GET.get('kind',''), request.GET.get('active','')
    if parsed is None or kind not in ('',*KINDS) or active not in ('','1','0'):
        return fail('Invalid editorial filters.',400)
    page, query = parsed
    qs = EditorialTerm.objects.all()
    if kind: qs = qs.filter(kind=kind)
    if active: qs = qs.filter(active=active=='1')
    if query: qs = qs.filter(Q(name__icontains=query) | Q(key__contains=query.casefold()))
    start = (page-1)*50
    rows = list(qs.order_by('kind','name','id')[start:start+51])
    return JsonResponse({'results':[term_row(t) for t in rows[:50]],'page':page,'hasMore':len(rows)>50})


@json_post
@require_role('owner')
def term_change(request, data):
    action = data.get('action')
    try:
        if action == 'create' and set(data)=={'action','kind','name'} and isinstance(data['kind'],str) and data['kind'] in KINDS:
            kind = data['kind']; name = text(data['name'], KINDS[kind], 1)
            if (kind=='tag' and ',' in name) or any(c in name for c in '\r\n\t'):
                raise ValueError('Invalid editorial name.')
        elif action in ('archive','restore') and set(data)=={'action','id','version'}:
            if not isinstance(data['id'],str) or not data['id'].isascii() or not data['id'].isdigit() or len(data['id'])>18 or type(data['version']) is not int or not 1<=data['version']<2**53:
                raise ValueError('Invalid term version.')
        else: raise ValueError('Invalid editorial action.')
    except (ValueError,UnicodeError) as e: return fail(str(e),400)
    with transaction.atomic():
        if locked_role(request)!='owner': return fail('Access denied.',403)
        editorial_lock()
        if action=='create':
            term, created = EditorialTerm.objects.get_or_create(kind=kind,key=name.casefold(),defaults={'name':name})
            if not created: return fail('Term already exists. Restore it if archived.',409)
        else:
            term=EditorialTerm.objects.filter(pk=int(data['id'])).first()
            if not term: return fail('Term not found.',404)
            if term.version!=data['version']: return fail('Term changed. Refresh the directory.',409)
            if term.active==(action=='restore'): return fail('Term already has this status.',409)
            term.active=action=='restore'; term.version+=1; term.save(update_fields=['active','version'])
        audit('blog.term.'+action,request.user,subject=str(term.pk))
        return JsonResponse(term_row(term),status=201 if action=='create' else 200)


@require_GET
@require_role('owner','staff')
def seo_list(request):
    parsed = pagination(request, {'page','q'})
    if parsed is None: return fail('Invalid SEO filters.',400)
    page,query=parsed
    qs=Post.objects.exclude(status='archived')
    if query: qs=qs.filter(Q(slug__icontains=query)|Q(draft__title__icontains=query))
    start=(page-1)*20
    rows=list(qs.order_by('-updated_at','id')[start:start+21])
    # Return compact audit inputs, not every full article. Detailed checks run in the editor.
    def meta(post):
        f=post.draft
        return {'slug':post.slug,'status':post.status,'title':f['title'],'seoTitle':f['seoTitle'],'seoDescription':f['seoDescription'],
                'summary':f['summary'],'focusKeyword':f.get('focusKeyword',''),'noindex':f.get('noindex',False),'cover':f['cover'],
                'coverAlt':f.get('coverAlt',''),'hasUnpublishedChanges':post.draft!=post.published}
    summary=qs.aggregate(total=Count('id'), published=Count('id',filter=Q(status='published')), noindex=Count('id',filter=Q(draft__noindex=True)))
    return JsonResponse({'results':[meta(p) for p in rows[:20]],'page':page,'hasMore':len(rows)>20,'summary':summary})
