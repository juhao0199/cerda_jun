import uuid
from django.db import models
from django.conf import settings

class Inquiry(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        REVIEWED = 'reviewed', 'Reviewed'
        CLOSED = 'closed', 'Closed'

    class Stage(models.TextChoices):
        NEW = 'new', 'New'
        QUALIFIED = 'qualified', 'Qualified'
        PROPOSAL = 'proposal', 'Proposal'
        WON = 'won', 'Won'
        LOST = 'lost', 'Lost'

    crm_stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.NEW, db_index=True)
    crm_version = models.PositiveBigIntegerField(default=1)
    # The original website submission remains immutable for public request replay.
    crm_contact = models.JSONField(default=dict, blank=True)
    crm_service = models.CharField(max_length=16, null=True, blank=True)
    crm_source = models.CharField(max_length=16, default='website', db_index=True)
    crm_priority = models.CharField(max_length=8, default='normal', db_index=True)
    crm_value = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    crm_currency = models.CharField(max_length=3, default='USD')
    crm_close_date = models.DateField(null=True, blank=True)
    crm_tags = models.JSONField(default=list, blank=True)
    crm_archived_at = models.DateTimeField(null=True, blank=True, db_index=True)
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.PROTECT, related_name="assigned_inquiries")
    client = models.ForeignKey('Client', null=True, blank=True, on_delete=models.PROTECT, related_name='inquiries')
    reference = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request_id = models.UUIDField(unique=True, editable=False)
    email = models.EmailField(max_length=254)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.NEW)

    class Meta:
        db_table = 'studio_inquiries'
        indexes = [models.Index(fields=['-created_at'], name='studio_created_idx'),
                   models.Index(fields=['email', '-created_at'], name='studio_email_created_idx')]
        constraints = [models.CheckConstraint(condition=models.Q(status__in=['new','reviewed','closed']), name='studio_status_valid'),
                       models.CheckConstraint(condition=models.Q(crm_stage__in=['new','qualified','proposal','won','lost']), name='crm_stage_valid')]


class Client(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    name = models.CharField(max_length=120)
    company = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class LeadActivity(models.Model):
    inquiry = models.ForeignKey(Inquiry, on_delete=models.PROTECT, related_name='crm_activity')
    actor_id = models.PositiveBigIntegerField()
    action = models.CharField(max_length=24)
    message = models.CharField(max_length=1000, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-pk']
        indexes = [models.Index(fields=['inquiry', '-created_at', '-id'], name='crm_activity_order_idx')]
