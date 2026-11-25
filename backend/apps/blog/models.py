import uuid
from django.db import models


class Post(models.Model):
    slug = models.SlugField(max_length=100, unique=True)
    status = models.CharField(max_length=9, default='draft', db_index=True)
    version = models.PositiveBigIntegerField(default=1)
    draft = models.JSONField()
    published = models.JSONField(null=True, default=None)
    published_at = models.DateTimeField(null=True, default=None)
    first_published_at = models.DateTimeField(null=True, default=None)
    published_modified_at = models.DateTimeField(null=True, default=None)
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
    filename = models.CharField(max_length=120, default='image.jpg')
    alt = models.CharField(max_length=250, blank=True, default='')
    caption = models.CharField(max_length=500, blank=True, default='')
    size_bytes = models.PositiveIntegerField(default=0)
    version = models.PositiveBigIntegerField(default=1)
    object_key = models.CharField(max_length=100, blank=True, default='')


class EditorialTerm(models.Model):
    kind = models.CharField(max_length=8)
    name = models.CharField(max_length=80)
    key = models.CharField(max_length=240)
    active = models.BooleanField(default=True)
    version = models.PositiveBigIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['kind', 'key'], name='blog_term_unique'),
                       models.CheckConstraint(condition=models.Q(kind__in=['category', 'tag', 'author']), name='blog_term_kind_valid')]


class SlugAlias(models.Model):
    slug = models.SlugField(max_length=100, unique=True)
    post = models.ForeignKey(Post, on_delete=models.PROTECT, related_name='aliases')
    created_at = models.DateTimeField(auto_now_add=True)


class DiscoveryObservation(models.Model):
    """Append-only human observations, not provider analytics."""
    mode = models.CharField(max_length=3)
    engine = models.CharField(max_length=40)
    prompt = models.CharField(max_length=500)
    target = models.CharField(max_length=160)
    outcome = models.CharField(max_length=12)
    evidence = models.CharField(max_length=1500)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['mode', '-created_at'], name='blog_disc_mode_date_idx')]
        constraints = [models.CheckConstraint(condition=models.Q(mode__in=['aeo','geo']), name='blog_disc_mode_valid'),
                       models.CheckConstraint(condition=models.Q(outcome__in=['present','absent','inconclusive']), name='blog_disc_result_valid')]


class CrawlerPolicy(models.Model):
    """Singleton; changes affect only public robots.txt, never authentication."""
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    version = models.PositiveBigIntegerField(default=1)
    directives = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(id=1), name='blog_crawler_singleton')]


class SiteAudit(models.Model):
    """Append-only measured reports; no fetched HTML or secrets retained."""
    actor_id = models.PositiveBigIntegerField()
    report = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
