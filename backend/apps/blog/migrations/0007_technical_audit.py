from django.db import migrations, models


def seed(apps, schema_editor):
    apps.get_model('blog', 'CrawlerPolicy').objects.create(id=1, version=1, directives=dict.fromkeys([
        'Googlebot', 'bingbot', 'OAI-SearchBot', 'GPTBot', 'Claude-SearchBot', 'ClaudeBot',
        'Claude-User', 'PerplexityBot', 'Google-Extended'], 'inherit'))


class Migration(migrations.Migration):
    dependencies = [('blog', '0006_discovery_observation')]
    operations = [
        migrations.CreateModel(name='CrawlerPolicy', fields=[
            ('id', models.PositiveSmallIntegerField(default=1, editable=False, primary_key=True, serialize=False)),
            ('version', models.PositiveBigIntegerField(default=1)), ('directives', models.JSONField()),
            ('updated_at', models.DateTimeField(auto_now=True)),
        ], options={'constraints': [models.CheckConstraint(condition=models.Q(id=1), name='blog_crawler_singleton')]}),
        migrations.CreateModel(name='SiteAudit', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('actor_id', models.PositiveBigIntegerField()), ('report', models.JSONField()),
            ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
        ]),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
