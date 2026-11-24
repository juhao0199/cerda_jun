import getpass
import re
import sys
import time
import pyotp
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.accounts.models import AccountSecurity
from apps.accounts.security import audit, encrypt_secret


class Command(BaseCommand):
    help = 'Create an MFA-protected account or reset an existing one via a trusted interactive terminal.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('--role', choices=['owner', 'staff', 'client'], required=True)
        parser.add_argument('--reset', action='store_true')

    def handle(self, *args, **options):
        if not sys.stdin.isatty():
            raise CommandError('A private interactive terminal is required.')
        username = options['username'].strip().lower()
        if not re.fullmatch(r'[a-z0-9][a-z0-9_.@+-]{0,149}', username):
            raise CommandError('Invalid username.')
        password = getpass.getpass('New password: ')
        if password != getpass.getpass('Confirm password: ') or len(password) > 256:
            raise CommandError('Passwords do not match or are too long.')
        User = get_user_model()
        secret = pyotp.random_base32()
        # Complete interactive enrollment before taking database locks.
        self.stdout.write('Add a time-based account in your authenticator. Private seed (do not log/share):')
        self.stdout.write(secret)
        code = getpass.getpass('Authenticator code: ')
        totp = pyotp.TOTP(secret)
        current = int(time.time()) // totp.interval
        verified_step = next((step for step in (current, current - 1, current + 1) if totp.generate_otp(step) == code), None)
        if verified_step is None:
            raise CommandError('Authenticator verification failed; nothing changed.')
        with transaction.atomic():
            user = User.objects.select_for_update().filter(username=username).first()
            if bool(user) != options['reset']:
                raise CommandError('Use --reset only for an existing account.')
            user = user or User(username=username)
            try:
                validate_password(password, user)
            except ValidationError as exc:
                raise CommandError('; '.join(exc.messages)) from exc
            user.set_password(password)
            user.is_active = True
            # No Django-admin or superuser bypass. Application role is independent.
            user.is_staff = False
            user.is_superuser = False
            user.save()
            profile, created = AccountSecurity.objects.get_or_create(user=user, defaults={'role':options['role'], 'totp_ciphertext':encrypt_secret(secret), 'last_totp_step':verified_step})
            if not created:
                profile.role = options['role']
                profile.totp_ciphertext = encrypt_secret(secret)
                profile.last_totp_step = verified_step
                profile.version += 1
                profile.save()
            audit('account.provisioned' if created else 'account.recovered', user)
        self.stdout.write(self.style.SUCCESS('Account ready. Wait for a fresh OTP before signing in.'))
