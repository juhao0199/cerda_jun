import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(name='Post', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('slug', models.SlugField(max_length=100, unique=True)),
            ('status', models.CharField(db_index=True, default='draft', max_length=9)),
            ('version', models.PositiveBigIntegerField(default=1)),
            ('draft', models.JSONField()), ('published', models.JSONField(default=None, null=True)),
            ('published_at', models.DateTimeField(default=None, null=True)),
            ('updated_at', models.DateTimeField(auto_now=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
        ], options={'constraints': [models.CheckConstraint(condition=models.Q(status__in=['draft', 'published', 'archived']), name='blog_status_valid')]}),
        migrations.CreateModel(name='Revision', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('version', models.PositiveBigIntegerField()), ('status', models.CharField(max_length=9)),
            ('action', models.CharField(max_length=12)), ('snapshot', models.JSONField()),
            ('actor_id', models.PositiveBigIntegerField(null=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('post', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='revisions', to='blog.post')),
        ], options={'constraints': [models.UniqueConstraint(fields=('post', 'version'), name='blog_revision_unique')]}),
    ]
