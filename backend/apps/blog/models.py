import uuid
from django.db import models


class Post(models.Model):
    slug = models.SlugField(max_length=100, unique=True)
    status = models.CharField(max_length=9, default='draft', db_index=True)
    version = models.PositiveBigIntegerField(default=1)
    draft = models.JSONField()
    published = models.JSONField(null=True, default=None)
    published_at = models.DateTimeField(null=True, default=None)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(status__in=['draft', 'published', 'archived']), name='blog_status_valid')]


class Revision(models.Model):
    post = models.ForeignKey(Post, on_delete=models.PROTECT, related_name='revisions')
    version = models.PositiveBigIntegerField()
    status = models.CharField(max_length=9)
    action = models.CharField(max_length=12)
    snapshot = models.JSONField()
    actor_id = models.PositiveBigIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['post', 'version'], name='blog_revision_unique')]


class CoverImage(models.Model):
    """Immutable processed image. Publication is controlled by Post snapshots."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    data = models.BinaryField(editable=False)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
