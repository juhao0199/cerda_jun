from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.accounts.models import AccountSecurity
from apps.accounts.security import audit


class Command(BaseCommand):
    help = 'Revoke sessions, disable an account, or change its application role.'

    def add_arguments(self, parser):
        parser.add_argument('username')
        parser.add_argument('action', choices=['revoke', 'disable', 'role'])
        parser.add_argument('--role', choices=['owner','staff','client'])

    def handle(self, *args, **options):
        with transaction.atomic():
            user = get_user_model().objects.select_for_update().filter(username=options['username'].lower()).first()
            if not user:
                raise CommandError('Account not found.')
            profile = AccountSecurity.objects.select_for_update().filter(user=user).first()
            if not profile:
                raise CommandError('Account has no security profile.')
            action = options['action']
            if action == 'role':
                if not options['role']:
                    raise CommandError('--role is required.')
                profile.role = options['role']
            if action == 'disable':
                user.is_active = False
                user.save(update_fields=['is_active'])
            profile.version += 1
            profile.save(update_fields=['role','version'])
            audit('account.' + action, user)
        self.stdout.write('Done. Existing sessions are invalid on their next request.')
