from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.utils import timezone
from apps.accounts.models import AttemptBucket

class Command(BaseCommand):
    help = 'Delete expired throttle buckets and sessions; audit retention is separate.'
    def handle(self, *args, **options):
        count, _ = AttemptBucket.objects.filter(expires_at__lt=timezone.now()).delete()
        call_command('clearsessions')
        self.stdout.write(f'Deleted {count} expired attempt buckets.')
