"""Authentication primitives. PostgreSQL is the shared coordination store."""
import hashlib
import hmac
import ipaddress
import time
from datetime import timedelta
from cryptography.fernet import Fernet
import pyotp
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import AccountSecurity, AttemptBucket, SecurityEvent


def fingerprint(value: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), value.encode(), hashlib.sha256).hexdigest()


def source_ip(request) -> str:
    raw = request.META.get('REMOTE_ADDR', '')
    if settings.CEDAR_TRUST_EDGE:
        # Only allowed behind the private, header-overwriting edge in production.
        raw = request.META.get('HTTP_X_CEDAR_CLIENT_IP', '')
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return 'unknown'


def audit(action: str, user=None, subject: str = ''):
    SecurityEvent.objects.create(action=action, actor_id=user.pk if user else None,
                                 subject=fingerprint(subject) if subject else '')


def reserve_attempt(scope: str, ip: str, username: str) -> bool:
    """Fixed windows, shared across workers; no password checks inside the lock."""
    window = 300
    epoch = int(time.time()) // window
    expires = timezone.now() + timedelta(seconds=window * 2)
    limits = [(f'{scope}:global', 180), (f'{scope}:ip:{ip}', 30),
              (f'{scope}:identity:{username}', 20), (f'{scope}:pair:{ip}:{username}', 5)]
    keys = [(fingerprint(f'{epoch}:{key}'), limit) for key, limit in limits]
    with transaction.atomic():
        for key, limit in keys:
            row, _ = AttemptBucket.objects.get_or_create(key=key, defaults={'expires_at': expires})
            row = AttemptBucket.objects.select_for_update().get(pk=row.pk)
            if row.count >= limit:
                # Earlier counters still increment: an attempt is an attempt.
                return False
            row.count += 1
            row.save(update_fields=['count'])
    return True


def encrypt_secret(secret: str) -> bytes:
    return Fernet(settings.CEDAR_MFA_KEY.encode()).encrypt(secret.encode())


def verify_totp_locked(profile: AccountSecurity, code: str) -> bool:
    """Caller MUST hold select_for_update on profile inside a transaction."""
    if len(code) != 6 or not code.isascii() or not code.isdigit():
        return False
    secret = Fernet(settings.CEDAR_MFA_KEY.encode()).decrypt(bytes(profile.totp_ciphertext)).decode()
    totp = pyotp.TOTP(secret)
    now = int(time.time()) // totp.interval
    # Allow modest clock drift; reject reused or older time steps.
    for step in (now, now - 1, now + 1):
        if step > profile.last_totp_step and hmac.compare_digest(totp.generate_otp(step), code):
            profile.last_totp_step = step
            profile.save(update_fields=['last_totp_step'])
            return True
    return False
