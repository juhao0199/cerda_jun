import uuid
from django.db import models


class Quotation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    lead = models.ForeignKey('inquiries.Inquiry', on_delete=models.PROTECT, related_name='quotations')
    version = models.PositiveBigIntegerField(default=1)
    status = models.CharField(max_length=8, default='draft', db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(status__in=['draft','issued','void']), name='quotation_status_valid')]


class Revision(models.Model):
    quotation = models.ForeignKey(Quotation, on_delete=models.PROTECT, related_name='revisions')
    version = models.PositiveBigIntegerField()
    status = models.CharField(max_length=8)
    snapshot = models.JSONField()
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['quotation','version'], name='quotation_revision_unique')]
