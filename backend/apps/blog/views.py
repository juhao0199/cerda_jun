import json
from functools import wraps
from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import transaction
from django.db.models import Q, Count
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from apps.accounts.views import require_role, fail
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role, pagination
from .content import normalize, slug_value, minutes
from .models import Post, Revision, CoverImage


# Blog content has its own bounded JSON budget; do not relax auth/CRM limits.
def blog_post(view):
    @require_POST
    @csrf_protect
    @wraps(view)
    def wrapper(request):
        if request.headers.get('Origin') != settings.SITE_ORIGIN:
            return fail('Request verification failed.', 403)
        if request.content_type != 'application/json':
            return fail('Expected JSON.', 415)
        try:
            if len(request.body) > 23000:
                return fail('Article request too large (23 KB).', 413)
            data = json.loads(request.body)
        except RequestDataTooBig:
            return fail('Article request too large (23 KB).', 413)
        except (ValueError, UnicodeError, RecursionError):
            return fail('Invalid request.', 400)
        if not isinstance(data, dict):
            return fail('Invalid request.', 400)
        return view(request, data)
    return wrapper


def cover_exists(fields):
    cover = fields['cover']
    return not cover.startswith('upload:') or CoverImage.objects.filter(pk=cover[7:]).exists()


def row(post):
    return {'slug': post.slug, 'status': post.status, 'version': post.version,
            'title': post.draft['title'], 'category': post.draft['category'],
            'updatedAt': post.updated_at.isoformat(), 'hasUnpublishedChanges': post.published != post.draft}


def detail(post):
    return {**row(post), 'draft': post.draft,
            'history': [{'version': r.version, 'status': r.status, 'action': r.action, 'createdAt': r.created_at.isoformat()} for r in post.revisions.order_by('-version')[:100]]}


def record(post, action, user):
    Revision.objects.create(post=post, version=post.version, status=post.status, action=action, snapshot=post.draft, actor_id=user.pk)
    audit('blog.' + action, user, subject=post.slug)


def public_row(post, full=False):
    fields = post.published
    result = {'slug': post.slug, 'title': fields['title'], 'category': fields['category'],
              'summary': fields['summary'], 'minutes': minutes(fields), 'cover': fields['cover'],
              'publishedAt': post.published_at.isoformat()}
    if full:
        result.update({k: fields[k] for k in ('sections', 'tags', 'seoTitle', 'seoDescription')})
    return result


@require_GET
def public_list(request):
    parsed = pagination(request, {'page'})
    if parsed is None:
        return fail('Invalid page.', 400)
    page, _ = parsed
    start = (page - 1) * 24
    rows = list(Post.objects.filter(status='published', published__isnull=False, published_at__isnull=False).order_by('-published_at', 'id')[start:start + 25])
    return JsonResponse({'results': [public_row(p) for p in rows[:24]], 'page': page, 'hasMore': len(rows) > 24})


@require_GET
def public_detail(request, slug):
    post = Post.objects.filter(slug=slug, status='published', published__isnull=False, published_at__isnull=False).first()
    return JsonResponse(public_row(post, True)) if post else fail('Article not found.', 404)


@require_GET
@require_role('owner', 'staff')
def listing(request):
    parsed = pagination(request, {'page', 'q', 'status'})
    status = request.GET.get('status', '')
    if parsed is None or status not in ('', 'draft', 'published', 'archived'):
        return fail('Invalid filters.', 400)
    page, query = parsed
    qs = Post.objects.all()
    counts = {r['status']: r['count'] for r in qs.values('status').annotate(count=Count('pk'))}
    if status:
        qs = qs.filter(status=status)
    if query:
        qs = qs.filter(Q(slug__icontains=query) | Q(draft__title__icontains=query) | Q(draft__category__icontains=query))
    start = (page - 1) * 25
    rows = list(qs.order_by('-updated_at', 'id')[start:start + 26])
    return JsonResponse({'results': [row(p) for p in rows[:25]], 'page': page, 'hasMore': len(rows) > 25,
                         'counts': {k: counts.get(k, 0) for k in ('draft', 'published', 'archived')}})


@require_GET
@require_role('owner', 'staff')
def get_post(request, slug):
    post = Post.objects.filter(slug=slug).first()
    return JsonResponse(detail(post)) if post else fail('Article not found.', 404)


@require_GET
@require_role('owner', 'staff')
def get_revision(request, slug, version):
    if not 1 <= version < 2**53:
        return fail('Invalid version.', 400)
    r = Revision.objects.filter(post__slug=slug, version=version).first()
    return JsonResponse({'version': r.version, 'status': r.status, 'action': r.action, 'snapshot': r.snapshot}) if r else fail('Revision not found.', 404)


@blog_post
@require_role('owner', 'staff')
def create(request, data):
    try:
        if set(data) != {'slug', 'fields'}:
            raise ValueError('Invalid request fields.')
        slug, fields = slug_value(data['slug']), normalize(data['fields'])
    except (ValueError, UnicodeError) as e:
        return fail(str(e), 400)
    with transaction.atomic():
        if not locked_role(request):
            return fail('Access denied.', 403)
        if not cover_exists(fields):
            return fail('Cover image not found.', 400)
        post, created = Post.objects.get_or_create(slug=slug, defaults={'draft': fields})
        if not created:
            return fail('Slug already exists. Open the existing article or use a different slug.', 409)
        record(post, 'create', request.user)
        return JsonResponse(detail(post), status=201)


@blog_post
@require_role('owner', 'staff')
def change(request, data):
    action = data.get('action')
    if not isinstance(action, str) or action not in ('save', 'publish', 'archive', 'restore'):
        return fail('Invalid action.', 400)
    try:
        if set(data) != ({'slug', 'version', 'action', 'fields'} if action == 'save' else {'slug', 'version', 'action'}):
            raise ValueError('Invalid request fields.')
        slug = slug_value(data['slug'])
        version = data['version']
        if type(version) is not int or not 1 <= version < 2**53:
            raise ValueError('Invalid version.')
        fields = normalize(data['fields']) if action == 'save' else None
    except (ValueError, UnicodeError) as e:
        return fail(str(e), 400)
    with transaction.atomic():
        role = locked_role(request)
        if not role or (action != 'save' and role != 'owner'):
            return fail('Access denied.', 403)
        post = Post.objects.select_for_update().filter(slug=slug).first()
        if not post:
            return fail('Article not found.', 404)
        if post.version != version:
            return fail('Article changed on the server. Reopen it before editing.', 409)
        if action == 'restore':
            if post.status != 'archived':
                return fail('Only archived articles can be restored.', 409)
            post.status = 'draft'
        elif post.status == 'archived':
            return fail('Restore the article before editing or publishing.', 409)
        elif action == 'save':
            if not cover_exists(fields):
                return fail('Cover image not found.', 400)
            post.draft = fields
        elif action == 'publish':
            if not cover_exists(post.draft):
                return fail('Cover image not found.', 400)
            post.status = 'published'
            post.published = post.draft
            post.published_at = timezone.now()
        elif action == 'archive':
            post.status = 'archived'
            post.published = None
            post.published_at = None
        post.version += 1
        post.save()
        record(post, action, request.user)
        return JsonResponse(detail(post))
