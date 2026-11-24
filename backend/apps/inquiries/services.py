from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID
from django.db import connection, transaction
from django.db.models import Count, Q
from django.utils import timezone
from .models import Inquiry
from .pricing import estimate

@dataclass(frozen=True)
class SaveResult:
    kind: str
    reference: UUID | None = None

def save_inquiry(data):
    discovery = data['discovery']
    payload = {key: data[key] for key in ('name', 'email', 'company', 'overview', 'discovery')}
    payload.update(estimate=estimate(discovery) if discovery else None, consentVersion='inquiry-v1', currency='USD')
    with transaction.atomic():
        # Shared lock serializes the short admission transaction across workers.
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(784103, 1)')
        existing = Inquiry.objects.filter(request_id=data['requestId']).first()
        if existing:
            # Compare submitted content rather than a price that may change on retry.
            same = all(existing.payload.get(key) == payload[key] for key in ('name','email','company','overview','discovery'))
            return SaveResult('duplicate', existing.reference) if same else SaveResult('conflict')
        counts = Inquiry.objects.filter(created_at__gte=timezone.now()-timedelta(hours=1)).exclude(payload__has_key='manualCreatedBy').aggregate(
            total=Count('reference'), email_count=Count('reference', filter=Q(email=data['email'])))
        if counts['total'] >= 100 or counts['email_count'] >= 5:
            return SaveResult('limited')
        inquiry = Inquiry.objects.create(request_id=data['requestId'], email=data['email'], payload=payload)
        return SaveResult('created', inquiry.reference)
