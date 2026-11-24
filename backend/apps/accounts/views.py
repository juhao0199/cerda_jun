import json
import time
from functools import wraps
from django.conf import settings
from django.contrib.auth import login, logout, get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError, RequestDataTooBig
from django.db import transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from apps.inquiries.scope import visible_leads
from apps.inquiries.contact import contact
from .models import AccountSecurity, SecurityEvent
from .security import audit, reserve_attempt, source_ip, verify_totp_locked


def fail(message, status):
    return JsonResponse({'error': message}, status=status)


def json_post(view):
    @require_POST
    @csrf_protect
    @wraps(view)
    def wrapped(request):
        if request.headers.get('Origin') != settings.SITE_ORIGIN:
            return fail('Request verification failed.', 403)
        if request.content_type != 'application/json':
            return fail('Expected JSON.', 415)
        try:
            body = request.body
            if len(body) > 8192:
                return fail('Request too large.', 413)
            data = json.loads(body)
        except RequestDataTooBig:
            return fail('Request too large.', 413)
        except (ValueError, UnicodeError, RecursionError):
            return fail('Invalid request.', 400)
        if not isinstance(data, dict):
            return fail('Invalid request.', 400)
        return view(request, data)
    return wrapped


def require_role(*roles):
    def decorate(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            profile = request.cedar_profile
            if not request.user.is_authenticated or not profile:
                return fail('Authentication required.', 401)
            if profile.role not in roles:
                return fail('Access denied.', 403)
            return view(request, *args, **kwargs)
        return wrapped
    return decorate


ALL_ROLES = ('owner', 'staff', 'client')


@require_GET
def csrf(request):
    return JsonResponse({'csrfToken': get_token(request)})


@json_post
def sign_in(request, data):
    if set(data) != {'username', 'password', 'code'} or not all(isinstance(v, str) for v in data.values()):
        return fail('Invalid request.', 400)
    username = data['username'].strip().lower()
    password, code = data['password'], data['code']
    if not 1 <= len(username) <= 150 or not 1 <= len(password) <= 256 or len(code) != 6:
        return fail('Invalid credentials.', 401)
    if not reserve_attempt('login', source_ip(request), username):
        response = fail('Too many attempts. Try again later.', 429)
        response['Retry-After'] = '300'
        return response
    user = get_user_model().objects.filter(username=username).first()
    if user is None:
        make_password(password)  # comparable work for unknown identities
    if user is not None and check_password(password, user.password):
        original_hash = user.password
        with transaction.atomic():
            # Same lock ordering as password changes and operator recovery.
            user = get_user_model().objects.select_for_update().get(pk=user.pk)
            profile = AccountSecurity.objects.select_for_update().filter(user=user).first()
            if user.is_active and user.password == original_hash and profile and verify_totp_locked(profile, code):
                # Explicitly discard any previous session; Django rotates CSRF on login.
                request.session.flush()
                user.backend = 'django.contrib.auth.backends.ModelBackend'
                login(request, user)
                now = int(time.time())
                request.session.update({
    "cedar_started": now,
    "cedar_seen": now,
    "cedar_version": profile.version,
    "cedar_mfa": True,
})
                request.session.set_expiry(8 * 3600)
                audit('login.success', user)
                return JsonResponse({'username': user.get_username(), 'role': profile.role, 'csrfToken': get_token(request)})
    audit('login.failure', subject=username)
    return fail('Invalid credentials.', 401)


@json_post
@require_role(*ALL_ROLES)
def sign_out(request, data):
    if data:
        return fail('Invalid request.', 400)
    audit('logout', request.user)
    logout(request)
    return JsonResponse({'ok': True})


@require_GET
@require_role(*ALL_ROLES)
def me(request):
    return JsonResponse({'username': request.user.get_username(), 'role': request.cedar_profile.role})


@json_post
@require_role(*ALL_ROLES)
def change_password(request, data):
    if set(data) != {'currentPassword', 'newPassword', 'code'} or not all(isinstance(v, str) and len(v) <= 256 for v in data.values()):
        return fail('Invalid request.', 400)
    if not reserve_attempt('password', source_ip(request), request.user.get_username()):
        return fail('Too many attempts. Try again later.', 429)
    with transaction.atomic():
        user = get_user_model().objects.select_for_update().get(pk=request.user.pk)
        profile = AccountSecurity.objects.select_for_update().get(user=user)
        if not user.is_active or profile.version != request.session.get('cedar_version') or not check_password(data['currentPassword'], user.password):
            audit('password.failure', user)
            return fail('Verification failed.', 403)
        try:
            validate_password(data['newPassword'], user)
            if check_password(data['newPassword'], user.password):
                raise ValidationError('Choose a different password.')
        except ValidationError as exc:
            return JsonResponse({'error': 'Password policy not met.', 'details': exc.messages}, status=400)
        if not verify_totp_locked(profile, data['code']):
            audit('password.failure', user)
            return fail('Verification failed.', 403)
        user.set_password(data['newPassword'])
        user.save(update_fields=['password'])
        profile.version += 1
        profile.save(update_fields=['version'])
        audit('password.changed', user)
    logout(request)
    return JsonResponse({'ok': True})


@require_GET
@require_role('owner', 'staff')
def inquiries(request):
    rows = visible_leads(request.user.pk, request.cedar_profile.role).filter(crm_archived_at__isnull=True).order_by('-created_at', 'reference')[:50]
    return JsonResponse({'results': [{'reference': str(row.reference), 'email': contact(row)['email'], 'status': row.status,
                                     'createdAt': row.created_at.isoformat()} for row in rows]})


@require_GET
@require_role('owner')
def events(request):
    rows = SecurityEvent.objects.all()[:50]
    return JsonResponse({'results': [{'action': row.action, 'actorId': row.actor_id,
                                     'createdAt': row.created_at.isoformat()} for row in rows]})
