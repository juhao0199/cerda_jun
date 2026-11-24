from django.conf import settings
from django.db import models


class AccountSecurity(models.Model):
    class Role(models.TextChoices):
        OWNER = 'owner', 'Owner'
        STAFF = 'staff', 'Staff'
        CLIENT = 'client', 'Client'

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='security_profile')
    role = models.CharField(max_length=10, choices=Role.choices)
    version = models.PositiveBigIntegerField(default=1)
    totp_ciphertext = models.BinaryField()
    last_totp_step = models.BigIntegerField(default=-1)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(role__in=['owner', 'staff', 'client']), name='account_role_valid')]


class AttemptBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)


class SecurityEvent(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    action = models.CharField(max_length=48)
    actor_id = models.BigIntegerField(null=True)
    target_id = models.BigIntegerField(null=True, db_index=True)
    subject = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ['-created_at', '-pk']
