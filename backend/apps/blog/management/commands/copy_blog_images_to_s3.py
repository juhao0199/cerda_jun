from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.blog.models import CoverImage
from apps.blog.object_storage import put, StorageError


class Command(BaseCommand):
    help = 'Copy legacy images to private S3, verify the bytes, and retain the DB copy. Run as migrator.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true')

    def handle(self, *args, **options):
        qs = CoverImage.objects.filter(object_key='').order_by('id')
        if not options['apply']:
            self.stdout.write(f'{qs.count()} images eligible. No changes; add --apply to copy.')
            return
        copied = 0
        for image_id in qs.values_list('id', flat=True).iterator(chunk_size=100):
            with transaction.atomic():
                image = CoverImage.objects.select_for_update().filter(pk=image_id, object_key='').first()
                if not image:
                    continue
                try:
                    image.object_key = put(image.pk, bytes(image.data))
                except StorageError as exc:
                    raise CommandError(f'Copy stopped at {image_id}; database bytes retained.') from exc
                image.save(update_fields=['object_key'])
                copied += 1
        self.stdout.write(self.style.SUCCESS(f'Copied {copied} images; database bytes retained.'))
