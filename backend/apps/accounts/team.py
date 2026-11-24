"""Owner-only account administration. No credentials or MFA seeds leave the server."""
import re
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .models import AccountSecurity, SecurityEvent
from .security import reserve_attempt, source_ip, verify_totp_locked
from .views import fail, json_post, require_role

PAGE_SIZE = 30
MAX_ID = 2**63 - 1


def positive_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,18}', value):
        raise ValueError('Invalid identifier.')
    number = int(value)
    if number > MAX_ID:
        raise ValueError('Invalid identifier.')
    return number


def query(request, allowed):
    if set(request.GET) - allowed or any(len(v) != 1 for _, v in request.GET.lists()):
        raise ValueError('Invalid query.')
    page = positive_id(request.GET.get('page', '1'))
    if page > 1000:
        raise ValueError('Page out of range.')
    return page


def page_result(rows, page, serialize):
    start = (page - 1) * PAGE_SIZE
    batch = list(rows[start:start + PAGE_SIZE + 1])
    return JsonResponse({'results': [serialize(row) for row in batch[:PAGE_SIZE]],
                         'page': page, 'hasMore': len(batch) > PAGE_SIZE})


def account_data(profile):
    user = profile.user
    return {'id': str(user.pk), 'username': user.get_username(), 'role': profile.role,
            'active': user.is_active, 'version': str(profile.version),
            'protected': profile.role == 'owner' or user.is_superuser or user.is_staff,
            'lastLogin': user.last_login.isoformat() if user.last_login else None}


@require_GET
@require_role('owner')
def accounts(request):
    try:
        page = query(request, {'page', 'search', 'role', 'status'})
        search = request.GET.get('search', '').strip()
        role = request.GET.get('role', '')
        status = request.GET.get('status', '')
        if len(search) > 150 or role not in ('', 'owner', 'staff', 'client') or status not in ('', 'active', 'disabled'):
            raise ValueError('Invalid filters.')
    except ValueError:
        return fail('Invalid filters.', 400)
    rows = AccountSecurity.objects.select_related('user').order_by('user__username', 'user_id')
    if search:
        rows = rows.filter(user__username__icontains=search)
    if role:
        rows = rows.filter(role=role)
    if status:
        rows = rows.filter(user__is_active=status == 'active')
    return page_result(rows, page, account_data)


@json_post
@require_role('owner')
def account_action(request, data):
    required = {'id', 'version', 'action', 'password', 'code'}
    if not all(isinstance(v, str) for v in data.values()):
        return fail('Invalid request.', 400)
    action = data.get('action')
    if action not in ('revoke', 'disable', 'enable', 'role') or set(data) != (required | ({'role'} if action == 'role' else set())):
        return fail('Invalid request.', 400)
    if action == 'role' and data['role'] not in ('staff', 'client'):
        return fail('Invalid role.', 400)
    try:
        target_id = positive_id(data['id'])
        version = positive_id(data['version'])
    except ValueError:
        return fail('Invalid request.', 400)
    if not 1 <= len(data['password']) <= 256 or not re.fullmatch(r'[0-9]{6}', data['code']):
        return fail('Invalid request.', 400)
    actor_id = request.user.pk
    if target_id == actor_id:
        return fail('Owner accounts are managed through the operator console.', 403)
    if not reserve_attempt('team', source_ip(request), request.user.get_username()):
        response = fail('Too many attempts. Try again later.', 429)
        response['Retry-After'] = '300'
        return response
    User = get_user_model()
    with transaction.atomic():
        # Lock user rows before profiles, in stable order (consistent with login/recovery).
        users = {u.pk: u for u in User.objects.select_for_update().filter(pk__in=[actor_id, target_id]).order_by('pk')}
        profiles = {p.user_id: p for p in AccountSecurity.objects.select_for_update().filter(user_id__in=users).order_by('user_id')}
        actor, ap = users.get(actor_id), profiles.get(actor_id)
        if not actor or not actor.is_active or not ap or ap.role != 'owner' or ap.version != request.session.get('cedar_version'):
            return fail('Authentication required.', 401)
        target, tp = users.get(target_id), profiles.get(target_id)
        if not target or not tp:
            return fail('Account not found.', 404)
        if tp.role == 'owner' or target.is_superuser or target.is_staff:
            return fail('Protected account.', 403)
        if tp.version != version:
            return fail('Account changed. Refresh before trying again.', 409)
        if not check_password(data['password'], actor.password) or not verify_totp_locked(ap, data['code']):
            SecurityEvent.objects.create(action='team.verification.failure', actor_id=actor_id, target_id=target_id)
            return fail('Verification failed.', 403)
        if action == 'disable':
            target.is_active = False
            target.save(update_fields=['is_active'])
        elif action == 'enable':
            target.is_active = True
            target.save(update_fields=['is_active'])
        elif action == 'role':
            tp.role = data['role']
        # All changes invalidate every previous session, including on re-enable.
        tp.version += 1
        tp.save(update_fields=['role', 'version'])
        SecurityEvent.objects.create(action='team.' + action, actor_id=actor_id, target_id=target_id)
        tp.user = target
        return JsonResponse(account_data(tp))


@require_GET
@require_role('owner')
def security_events(request):
    try:
        page = query(request, {'page', 'category', 'account'})
        category = request.GET.get('category', '')
        account = request.GET.get('account', '')
        if category not in ('', 'login', 'logout', 'password', 'account', 'team', 'crm', 'quotation', 'blog'):
            raise ValueError('Invalid category.')
        account_id = positive_id(account) if account else None
    except ValueError:
        return fail('Invalid filters.', 400)
    rows = SecurityEvent.objects.all()
    if category:
        rows = rows.filter(action='logout') if category == 'logout' else rows.filter(action__startswith=category + '.')
    if account_id is not None:
        from django.db.models import Q
        rows = rows.filter(Q(actor_id=account_id) | Q(target_id=account_id))
    return page_result(rows, page, lambda row: {'id': str(row.pk), 'action': row.action,
                       'actorId': str(row.actor_id) if row.actor_id is not None else None,
                       'targetId': str(row.target_id) if row.target_id is not None else None,
                       'createdAt': row.created_at.isoformat()})
