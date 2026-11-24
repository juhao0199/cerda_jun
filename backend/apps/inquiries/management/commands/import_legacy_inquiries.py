import json
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from apps.inquiries.models import Inquiry

class Command(BaseCommand):
    help = 'Import old Next.js inquiries from the same database. Stop old writes and back up first.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Without this flag, only report the legacy count.')

    @transaction.atomic
    def handle(self, *args, **options):
        if 'inquiries' not in connection.introspection.table_names():
            raise CommandError('Legacy inquiries table not found.')
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(784103, 1)')
            cursor.execute('SELECT count(*) FROM inquiries')
            count = cursor.fetchone()[0]
            if not options['apply']:
                self.stdout.write(f'{count} legacy rows. No changes made.')
                return
            cursor.execute('SELECT reference, request_id, email, payload, created_at, status FROM inquiries ORDER BY created_at')
            imported = 0
            while rows := cursor.fetchmany(250):
                for ref, rid, email, payload, created_at, status in rows:
                    if isinstance(payload, str):
                        payload = json.loads(payload)
                    old = Inquiry.objects.filter(request_id=rid).first()
                    if old:
                        if old.reference != ref or old.payload != payload:
                            raise CommandError('Legacy import conflict; transaction rolled back.')
                        continue
                    Inquiry.objects.create(reference=ref, request_id=rid, email=email, payload=payload, status=status)
                    Inquiry.objects.filter(pk=ref).update(created_at=created_at)
                    imported += 1
        self.stdout.write(f'Imported {imported} of {count}; legacy table unchanged.')
