from datetime import date, datetime, timezone as utc
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.views.decorators.http import require_GET
from django.utils import timezone
from apps.accounts.models import AccountSecurity
from apps.accounts.security import audit
from apps.accounts.views import fail, require_role
from apps.inquiries.crm import locked_role
from .models import Post, WebsiteContent, WebsiteRevision, PublishingPlan, PublishingEvent
from .publishing_rules import ACTIVE, TRANSITIONS, OWNER_ACTIONS, schedule_time
from .website_rules import effective
from . import views, website_content
from .content import slug_value
from .editorial import editorial_lock


def target_lock(post_id=None, website_id=None):
    if post_id is not None:
        editorial_lock()
        return Post.objects.select_for_update().filter(pk=post_id).first()
    return WebsiteContent.objects.select_for_update().filter(pk=website_id).first()


def valid_note(value):
    if not isinstance(value,str) or len(value)>500 or '\x00' in value:
        return False
    try:
        value.encode('utf-8')
    except UnicodeError:
        return False
    return True


def ready(target):
    if isinstance(target, Post):
        from .competitor_rules import visible_text
        from .content import STARTER_PLACEHOLDER
        return target.status != 'archived' and target.draft != target.published and STARTER_PLACEHOLDER.casefold() not in visible_text(target.draft)
    return bool(target and effective(target.draft) != effective(target.published))


def row(plan, history=False):
    target = plan.post if plan.post_id else plan.website
    result = {'id': plan.pk, 'kind': 'article' if plan.post_id else 'website',
              'slug': target.slug if plan.post_id else '',
              'title': target.draft.get('title', target.slug) if plan.post_id else 'Website content',
              'version': plan.version, 'targetVersion': plan.target_version, 'currentVersion': target.version,
              'status': plan.status, 'stale': plan.status == 'stale' or (plan.status in ACTIVE and (plan.target_version != target.version or not ready(target))),
              'scheduledAt': plan.scheduled_at.isoformat() if plan.scheduled_at else None,
              'publishedAt': plan.published_at.isoformat() if plan.published_at else None,
              'updatedAt': plan.updated_at.isoformat()}
    if history:
        result['events'] = [{'action': e.action, 'note': e.note, 'actorId': e.actor_id, 'targetVersion': e.target_version, 'scheduledAt': e.scheduled_at.isoformat() if e.scheduled_at else None, 'createdAt': e.created_at.isoformat()}
                            for e in plan.events.order_by('-version')[:50]]
    return result


def event(plan, action, actor, note=''):
    PublishingEvent.objects.create(plan=plan, version=plan.version, action=action, actor_id=actor.pk, note=note, target_version=plan.target_version, scheduled_at=plan.scheduled_at)
    audit('publishing.' + action, actor, subject=str(plan.pk))


def clear_approval(plan):
    plan.approved_by = plan.approval_account_version = plan.scheduled_at = None


def finish(plan, action, actor, note=''):
    plan.version += 1
    plan.save()
    event(plan, action, actor, note)


def publish(plan, target, actor):
    if plan.target_version != target.version or not ready(target):
        raise ValueError('Draft changed or is not publishable. Resubmit for review.')
    if isinstance(target, Post):
        views.apply_publication(target)
        target.version += 1
        target.save()
        views.record(target, 'publish', actor)
    else:
        website_content.apply_publication(target)
        target.version += 1
        target.save(update_fields=['published', 'published_at', 'version'])
        WebsiteRevision.objects.create(website=target, version=target.version, action='publish', snapshot=effective(target.draft), actor_id=actor.pk)
        audit('website.publish', actor, subject='public-site')
    plan.status = 'published'
    plan.published_at = timezone.now()


@require_GET
@require_role('owner', 'staff')
def listing(request):
    try:
        if set(request.GET) - {'month', 'page'}:
            raise ValueError()
        month = request.GET.get('month', timezone.now().strftime('%Y-%m'))
        if len(month) != 7:
            raise ValueError()
        start = date.fromisoformat(month + '-01')
        if not 2000 <= start.year <= 2100:
            raise ValueError()
        end = date(start.year + (start.month == 12), start.month % 12 + 1, 1)
        page = int(request.GET.get('page', '1'))
        if not 1 <= page <= 1000:
            raise ValueError()
    except (ValueError, OverflowError):
        return fail('Invalid calendar filters.', 400)
    base = PublishingPlan.objects.select_related('post', 'website')
    queue = list(base.order_by('-updated_at', '-pk')[(page-1)*25:page*25+1])
    lower=datetime.combine(start, datetime.min.time(), tzinfo=utc.utc)
    upper=datetime.combine(end, datetime.min.time(), tzinfo=utc.utc)
    calendar = list(base.filter(Q(status='scheduled',scheduled_at__gte=lower,scheduled_at__lt=upper) |
                                Q(status='published',published_at__gte=lower,published_at__lt=upper)).order_by('scheduled_at', 'pk')[:201])
    return website_content.response({'results': [row(p) for p in queue[:25]], 'hasMore': len(queue)>25,
                                     'calendar': [row(p) for p in calendar[:200]], 'calendarTruncated': len(calendar)>200})


@require_GET
@require_role('owner', 'staff')
def detail(request, plan_id):
    plan = PublishingPlan.objects.select_related('post','website').filter(pk=plan_id).first()
    return website_content.response(row(plan, True)) if plan else fail('Plan not found.', 404)


@views.blog_post
@require_role('owner', 'staff')
def submit(request, data):
    if set(data) != {'kind','slug','targetVersion','note'} or data['kind'] not in ('article','website') or type(data['targetVersion']) is not int or not 1 <= data['targetVersion'] < 2**53 or not valid_note(data['note']):
        return fail('Invalid submission.', 400)
    try:
        slug = slug_value(data['slug']) if data['kind']=='article' else None
        if slug is None and data['slug'] != '':
            raise ValueError('Unexpected slug.')
    except (ValueError, UnicodeError):
        return fail('Invalid target.', 400)
    with transaction.atomic():
        if not locked_role(request):
            return fail('Access denied.',403)
        if slug is not None:
            editorial_lock()
            target = Post.objects.select_for_update().filter(slug=slug).first()
            key = 'post'
        else:
            target = target_lock(website_id=1)
            key = 'website'
        if not target:
            return fail('Target not found.',404)
        if target.version != data['targetVersion'] or not ready(target):
            return fail('Load an unpublished saved draft before submitting.',409)
        if PublishingPlan.objects.filter(**{key:target}, status__in=ACTIVE).exists():
            return fail('An active plan already exists.',409)
        plan = PublishingPlan.objects.create(**{key:target}, target_version=target.version, submitted_by=request.user.pk)
        event(plan,'submit',request.user,data['note'].strip())
        return website_content.response(row(plan, True))


@views.blog_post
@require_role('owner','staff')
def change(request, data):
    if set(data) != {'id','version','action','note','scheduledAt','targetVersion'} or any(type(data[k]) is not int or not 1<=data[k]<2**53 for k in ('id','version','targetVersion')) or not isinstance(data['action'],str) or not valid_note(data['note']):
        return fail('Invalid action.',400)
    action, note = data['action'], data['note'].strip()
    if action=='return' and not note:
        return fail('A review note is required.',400)
    try:
        due = schedule_time(data['scheduledAt'],timezone.now()) if action=='schedule' else None
        if action!='schedule' and data['scheduledAt'] is not None:
            raise ValueError('Unexpected schedule.')
    except ValueError as exc:
        return fail(str(exc),400)
    with transaction.atomic():
        role=locked_role(request)
        if not role or (action in OWNER_ACTIONS and role!='owner'):
            return fail('Access denied.',403)
        ref=PublishingPlan.objects.filter(pk=data['id']).values('post_id','website_id').first()
        if not ref:
            return fail('Plan not found.',404)
        target=target_lock(**ref)
        plan=PublishingPlan.objects.select_for_update().get(pk=data['id'])
        if plan.version!=data['version'] or target.version!=data['targetVersion']:
            return fail('Plan or draft changed. Reload before proceeding.',409)
        stale=plan.target_version!=target.version or not ready(target)
        allowed=TRANSITIONS.get(plan.status,set())
        if plan.status in ACTIVE and stale:
            allowed={'resubmit','cancel'}
        if action not in allowed:
            return fail('Invalid transition. Reload the plan.',409)
        if action=='cancel' and role!='owner' and plan.submitted_by!=request.user.pk:
            return fail('Only the submitter or owner can cancel.',403)
        if action=='resubmit':
            if not ready(target):
                return fail('Save an unpublished draft before resubmitting.',409)
            plan.target_version=target.version
            plan.submitted_by=request.user.pk
            clear_approval(plan)
            plan.status='review'
        elif action=='approve':
            plan.approved_by=request.user.pk
            plan.approval_account_version=request.session.get('cedar_version')
            plan.status='approved'
        elif action=='return':
            clear_approval(plan)
            plan.status='returned'
        elif action=='cancel':
            clear_approval(plan)
            plan.status='cancelled'
        elif action=='schedule':
            # Scheduling is a fresh owner authorization, bound to account/session version.
            plan.approved_by=request.user.pk
            plan.approval_account_version=request.session.get('cedar_version')
            plan.scheduled_at=due
            plan.status='scheduled'
        elif action=='publish':
            try:
                publish(plan,target,request.user)
            except ValueError as exc:
                return fail(str(exc),409)
        finish(plan,action,request.user,note)
        return website_content.response(row(plan,True))


def run_due(limit=20):
    """Bounded worker. Each plan is rechecked under locks, so concurrent ticks are safe."""
    ids=list(PublishingPlan.objects.filter(status='scheduled',scheduled_at__lte=timezone.now()).order_by('scheduled_at','pk').values_list('pk',flat=True)[:limit])
    counts={'published':0,'stale':0,'skipped':0}
    for pk in ids:
        with transaction.atomic():
            ref=PublishingPlan.objects.filter(pk=pk).values('post_id','website_id','approved_by','version').first()
            if not ref:
                counts['skipped']+=1
                continue
            actor=get_user_model().objects.select_for_update().filter(pk=ref['approved_by']).first()
            profile=AccountSecurity.objects.select_for_update().filter(user=actor).first() if actor else None
            target=target_lock(post_id=ref['post_id'],website_id=ref['website_id'])
            plan=PublishingPlan.objects.select_for_update().get(pk=pk)
            if plan.status!='scheduled' or plan.version!=ref['version'] or plan.scheduled_at>timezone.now():
                counts['skipped']+=1
                continue
            reason=''
            if not actor or not actor.is_active or not profile or profile.role!='owner' or profile.version!=plan.approval_account_version:
                reason='Scheduling authorization is no longer valid.'
            else:
                try:
                    publish(plan,target,actor)
                except ValueError as exc:
                    reason=str(exc)
            if reason:
                plan.status='stale'
                plan.version+=1
                plan.save()
                PublishingEvent.objects.create(plan=plan,version=plan.version,action='blocked',actor_id=plan.approved_by,note=reason,target_version=plan.target_version,scheduled_at=plan.scheduled_at)
                audit('publishing.blocked',actor,subject=str(plan.pk))
                counts['stale']+=1
            else:
                finish(plan,'scheduled_publish',actor)
                counts['published']+=1
    return counts
