from django.db import migrations, models
import django.db.models.deletion


def seed(apps, schema_editor):
    apps.get_model('blog', 'WebsiteContent').objects.create(pk=1)


class Migration(migrations.Migration):
    dependencies = [('blog', '0010_competitor_intelligence')]
    operations = [
        migrations.CreateModel(name='WebsiteContent', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('draft', models.JSONField(default=dict)), ('published', models.JSONField(default=dict)),
            ('version', models.PositiveBigIntegerField(default=1)),
            ('published_at', models.DateTimeField(blank=True, null=True)),
        ]),
        migrations.CreateModel(name='WebsiteRevision', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('version', models.PositiveBigIntegerField()), ('action', models.CharField(max_length=12)),
            ('snapshot', models.JSONField()), ('actor_id', models.PositiveBigIntegerField()),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('website', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='revisions', to='blog.websitecontent')),
        ], options={'constraints': [models.UniqueConstraint(fields=('website', 'version'), name='website_revision_version_unique')]}),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
