import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from apps.blog.publishing import run_due


class Command(BaseCommand):
    help = 'Publish up to 20 due, owner-authorized editorial plans per tick; safe to run repeatedly.'

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true', help='Keep running, checking every 60 seconds until stopped.')

    def handle(self, *args, **options):
        while True:
            close_old_connections()
            counts = run_due()
            self.stdout.write(' '.join(f'{key}={value}' for key,value in counts.items()))
            if not options['watch']:
                return
            time.sleep(60)
