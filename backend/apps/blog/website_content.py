from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from apps.accounts.views import fail, require_role
from apps.accounts.security import audit
from apps.inquiries.crm import locked_role
from .models import WebsiteContent, WebsiteRevision, PublishingPlan
from .publishing_rules import ACTIVE
from .views import blog_post
from .website_rules import effective, normalize, public_fields


def apply_publication(site):
    site.published = effective(site.draft)
    site.published_at = timezone.now()


def row(site):
    return {'version': site.version, 'draft': effective(site.draft), 'published': effective(site.published),
            'publishedAt': site.published_at.isoformat() if site.published_at else None,
            'history': [{'version': r.version, 'action': r.action, 'createdAt': r.created_at.isoformat()} for r in site.revisions.order_by('-version')[:50]]}


def response(data):
    result = JsonResponse(data)
    result['Cache-Control'] = 'no-store'
    return result


@require_GET
def public_content(request):
    site = WebsiteContent.objects.filter(pk=1).first()
    if not site:
        return fail('Website configuration unavailable.', 503)
    return response({'fields': public_fields(site.published), 'publishedAt': site.published_at.isoformat() if site.published_at else None})


@require_GET
@require_role('owner', 'staff')
def detail(request):
    site = WebsiteContent.objects.filter(pk=1).first()
    return response(row(site)) if site else fail('Website configuration unavailable.', 503)


@blog_post
@require_role('owner', 'staff')
def change(request, data):
    action, version = data.get('action'), data.get('version')
    if not isinstance(action, str) or action not in ('save', 'publish', 'restore') or type(version) is not int or not 1 <= version < 2**53:
        return fail('Invalid action or version.', 400)
    expected = {'action', 'version'} | ({'fields'} if action == 'save' else {'revision'} if action == 'restore' else set())
    if set(data) != expected:
        return fail('Invalid action fields.', 400)
    try:
        fields = normalize(data['fields']) if action == 'save' else None
        if action == 'restore' and (type(data['revision']) is not int or not 1 <= data['revision'] < 2**53):
            raise ValueError('Invalid revision.')
    except ValueError as exc:
        return fail(str(exc), 400)
    with transaction.atomic():
        role = locked_role(request)
        if role not in ('owner', 'staff') or (action != 'save' and role != 'owner'):
            return fail('Access denied.', 403)
        site = WebsiteContent.objects.select_for_update().filter(pk=1).first()
        if not site:
            return fail('Website configuration unavailable.', 503)
        if site.version != version:
            return fail('Website changed. Reload before saving.', 409)
        if action == 'save':
            site.draft = fields
        elif action == 'publish':
            if PublishingPlan.objects.filter(website=site, status__in=ACTIVE).exists():
                return fail('An active publishing plan exists. Open Editorial calendar to publish or cancel it.', 409)
            apply_publication(site)
        else:
            rev = site.revisions.filter(version=data['revision']).first()
            if not rev:
                return fail('Revision not found.', 404)
            site.draft = effective(rev.snapshot)
        site.version += 1
        site.save(update_fields=['draft', 'published', 'published_at', 'version'])
        WebsiteRevision.objects.create(website=site, version=site.version, action=action, snapshot=effective(site.draft), actor_id=request.user.pk)
        audit('website.' + action, request.user, subject='public-site')
        return response(row(site))
