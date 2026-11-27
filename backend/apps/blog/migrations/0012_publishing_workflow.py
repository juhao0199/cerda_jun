from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('blog', '0011_website_content')]
    operations = [
        migrations.CreateModel(name='PublishingPlan', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('target_version', models.PositiveBigIntegerField()), ('version', models.PositiveBigIntegerField(default=1)),
            ('status', models.CharField(default='review', max_length=12)), ('submitted_by', models.PositiveBigIntegerField()),
            ('approved_by', models.PositiveBigIntegerField(null=True)), ('approval_account_version', models.PositiveBigIntegerField(null=True)),
            ('scheduled_at', models.DateTimeField(blank=True, null=True)), ('published_at', models.DateTimeField(blank=True, null=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('post', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='publishing_plans', to='blog.post')),
            ('website', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='publishing_plans', to='blog.websitecontent')),
        ], options={'constraints': [
            models.CheckConstraint(condition=(models.Q(post__isnull=False, website__isnull=True) | models.Q(post__isnull=True, website__isnull=False)), name='pubplan_one_target'),
            models.CheckConstraint(condition=models.Q(status__in=['review','returned','approved','scheduled','stale','published','cancelled']), name='pubplan_status_valid'),
            models.UniqueConstraint(fields=['post'], condition=models.Q(status__in=['review','returned','approved','scheduled','stale'], post__isnull=False), name='pubplan_active_post'),
            models.UniqueConstraint(fields=['website'], condition=models.Q(status__in=['review','returned','approved','scheduled','stale'], website__isnull=False), name='pubplan_active_website'),
        ], 'indexes': [models.Index(fields=['status','scheduled_at'], name='pubplan_due_idx')]}),
        migrations.CreateModel(name='PublishingEvent', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('version', models.PositiveBigIntegerField()), ('action', models.CharField(max_length=20)), ('target_version', models.PositiveBigIntegerField()), ('scheduled_at', models.DateTimeField(blank=True, null=True)), ('actor_id', models.PositiveBigIntegerField()),
            ('note', models.CharField(blank=True, max_length=500)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('plan', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='events', to='blog.publishingplan')),
        ], options={'constraints': [models.UniqueConstraint(fields=['plan','version'], name='pubevent_version_unique')]}),
    ]
