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


class TrackedPrompt(models.Model):
    """Immutable question and test context; archive to retire a test definition."""
    question = models.CharField(max_length=500)
    language = models.CharField(max_length=40)
    market = models.CharField(max_length=80)
    intent = models.CharField(max_length=20)
    key = models.CharField(max_length=64, unique=True)
    cadence_days = models.PositiveSmallIntegerField(default=7)
    engines = models.JSONField()
    active = models.BooleanField(default=True, db_index=True)
    version = models.PositiveBigIntegerField(default=1)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class PromptMeasurement(models.Model):
    """Append-only, human-observed result; never interpreted as provider analytics."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prompt = models.ForeignKey(TrackedPrompt, on_delete=models.PROTECT, related_name='measurements')
    engine = models.CharField(max_length=40)
    observed_at = models.DateTimeField()
    context = models.CharField(max_length=250)
    answer = models.CharField(max_length=12)
    brand = models.CharField(max_length=12)
    citation = models.CharField(max_length=12)
    sources = models.JSONField(default=list)
    evidence = models.CharField(max_length=1500)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['prompt', 'engine', '-observed_at'], name='blog_prompt_engine_time_idx')]
        constraints = [models.CheckConstraint(condition=models.Q(answer__in=['present','absent','inconclusive']), name='blog_measure_answer_valid'),
                       models.CheckConstraint(condition=models.Q(brand__in=['present','absent','inconclusive']), name='blog_measure_brand_valid'),
                       models.CheckConstraint(condition=models.Q(citation__in=['present','absent','inconclusive']), name='blog_measure_cite_valid')]


class Competitor(models.Model):
    """Stable identity; archive rather than repurpose an observed brand."""
    name = models.CharField(max_length=100)
    domain = models.CharField(max_length=253, unique=True)
    market = models.CharField(max_length=80)
    kind = models.CharField(max_length=12, default="unclassified", choices=[("unclassified", "Unclassified"), ("direct", "Direct competitor"), ("indirect", "Indirect competitor"), ("reference", "Reference brand")])
    active = models.BooleanField(default=True)
    version = models.PositiveBigIntegerField(default=1)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class CompetitorObservation(models.Model):
    competitor = models.ForeignKey(Competitor, on_delete=models.PROTECT, related_name='observations')
    measurement = models.ForeignKey(PromptMeasurement, on_delete=models.PROTECT, related_name='competitor_observations')
    brand = models.CharField(max_length=12)
    cited_sources = models.JSONField(default=list)
    evidence = models.CharField(max_length=1000)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['competitor','measurement'], name='blog_comp_measure_unique'),
                       models.CheckConstraint(condition=models.Q(brand__in=['present','absent','inconclusive']), name='blog_comp_brand_valid')]


class ContentOpportunity(models.Model):
    prompt = models.ForeignKey(TrackedPrompt, on_delete=models.PROTECT, related_name='opportunities')
    measurement = models.ForeignKey(PromptMeasurement, null=True, blank=True, on_delete=models.PROTECT)
    competitor = models.ForeignKey(Competitor, null=True, blank=True, on_delete=models.PROTECT)
    title = models.CharField(max_length=160)
    brief = models.CharField(max_length=1500)
    target = models.CharField(max_length=160, blank=True, default='')
    priority = models.CharField(max_length=8)
    status = models.CharField(max_length=12, default='open')
    post = models.OneToOneField(Post, null=True, blank=True, on_delete=models.PROTECT)
    version = models.PositiveBigIntegerField(default=1)
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(priority__in=['high','medium','low']), name='blog_gap_priority_valid'),
                       models.CheckConstraint(condition=models.Q(status__in=['open','in_progress','done','dismissed']), name='blog_gap_status_valid')]


class CompetitorIntelligence(models.Model):
    """Immutable evidence from a bounded public website sample."""
    competitor = models.ForeignKey(Competitor, on_delete=models.PROTECT, related_name='intelligence_reports')
    report = models.JSONField()
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class WebsiteContent(models.Model):
    """One seeded site-wide record. Public reads only the published snapshot."""
    draft = models.JSONField(default=dict)
    published = models.JSONField(default=dict)
    version = models.PositiveBigIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)


class WebsiteRevision(models.Model):
    website = models.ForeignKey(WebsiteContent, on_delete=models.PROTECT, related_name='revisions')
    version = models.PositiveBigIntegerField()
    action = models.CharField(max_length=12)
    snapshot = models.JSONField()
    actor_id = models.PositiveBigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['website', 'version'], name='website_revision_version_unique')]


class PublishingPlan(models.Model):
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.PROTECT, related_name='publishing_plans')
    website = models.ForeignKey(WebsiteContent, null=True, blank=True, on_delete=models.PROTECT, related_name='publishing_plans')
    target_version = models.PositiveBigIntegerField()
    version = models.PositiveBigIntegerField(default=1)
    status = models.CharField(max_length=12, default='review')
    submitted_by = models.PositiveBigIntegerField()
    approved_by = models.PositiveBigIntegerField(null=True)
    approval_account_version = models.PositiveBigIntegerField(null=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=(models.Q(post__isnull=False, website__isnull=True) | models.Q(post__isnull=True, website__isnull=False)), name='pubplan_one_target'),
            models.CheckConstraint(condition=models.Q(status__in=['review','returned','approved','scheduled','stale','published','cancelled']), name='pubplan_status_valid'),
            models.UniqueConstraint(fields=['post'], condition=models.Q(status__in=['review','returned','approved','scheduled','stale'], post__isnull=False), name='pubplan_active_post'),
            models.UniqueConstraint(fields=['website'], condition=models.Q(status__in=['review','returned','approved','scheduled','stale'], website__isnull=False), name='pubplan_active_website'),
        ]
        indexes = [models.Index(fields=['status','scheduled_at'], name='pubplan_due_idx')]


class PublishingEvent(models.Model):
    plan = models.ForeignKey(PublishingPlan, on_delete=models.PROTECT, related_name='events')
    version = models.PositiveBigIntegerField()
    action = models.CharField(max_length=20)
    target_version = models.PositiveBigIntegerField()
    scheduled_at = models.DateTimeField(null=True, blank=True)
    actor_id = models.PositiveBigIntegerField()
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['plan','version'], name='pubevent_version_unique')]


class TopicCluster(models.Model):
    name = models.CharField(max_length=120)
    keyword = models.CharField(max_length=100)
    market = models.CharField(max_length=100, blank=True, default='')
    intent = models.CharField(max_length=20, default='informational')
    keywords = models.JSONField(default=list)
    notes = models.TextField(blank=True, default='')
    version = models.PositiveBigIntegerField(default=1)
    archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class ContentTask(models.Model):
    title = models.CharField(max_length=160)
    stage = models.CharField(max_length=12, default='idea')
    priority = models.CharField(max_length=8, default='medium')
    keyword = models.CharField(max_length=100, blank=True, default='')
    audience = models.CharField(max_length=160, blank=True, default='')
    intent = models.CharField(max_length=20, default='informational')
    brief = models.TextField(blank=True, default='')
    outline = models.TextField(blank=True, default='')
    due = models.DateField(null=True, blank=True)
    assignee_id = models.PositiveBigIntegerField(null=True, blank=True)
    actor_id = models.PositiveBigIntegerField()
    version = models.PositiveBigIntegerField(default=1)
    cluster = models.ForeignKey(TopicCluster, null=True, blank=True, on_delete=models.PROTECT)
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.PROTECT)
    opportunity = models.OneToOneField(ContentOpportunity, null=True, blank=True, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=models.Q(stage__in=['idea','research','writing','optimizing','ready','archived']), name='content_task_stage_valid'), models.CheckConstraint(condition=models.Q(priority__in=['low','medium','high']), name='content_task_priority_valid')]
        indexes = [models.Index(fields=['stage','due'], name='content_task_stage_due')]
