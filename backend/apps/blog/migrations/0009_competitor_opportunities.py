from django.db import migrations, models
import django.db.models.deletion as deletion


class Migration(migrations.Migration):
    dependencies = [('blog', '0008_prompt_monitoring')]
    operations = [
        migrations.CreateModel(name='Competitor', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('name', models.CharField(max_length=100)), ('domain', models.CharField(max_length=253, unique=True)),
            ('market', models.CharField(max_length=80)), ('active', models.BooleanField(default=True)),
            ('version', models.PositiveBigIntegerField(default=1)), ('actor_id', models.PositiveBigIntegerField()),
            ('created_at', models.DateTimeField(auto_now_add=True))]),
        migrations.CreateModel(name='CompetitorObservation', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('brand', models.CharField(max_length=12)), ('cited_sources', models.JSONField(default=list)),
            ('evidence', models.CharField(max_length=1000)), ('actor_id', models.PositiveBigIntegerField()),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('competitor', models.ForeignKey(on_delete=deletion.PROTECT, related_name='observations', to='blog.competitor')),
            ('measurement', models.ForeignKey(on_delete=deletion.PROTECT, related_name='competitor_observations', to='blog.promptmeasurement'))],
            options={'constraints':[models.UniqueConstraint(fields=['competitor','measurement'], name='blog_comp_measure_unique'),
                models.CheckConstraint(condition=models.Q(brand__in=['present','absent','inconclusive']), name='blog_comp_brand_valid')]}),
        migrations.CreateModel(name='ContentOpportunity', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('title', models.CharField(max_length=160)), ('brief', models.CharField(max_length=1500)),
            ('target', models.CharField(blank=True, default='', max_length=160)), ('priority', models.CharField(max_length=8)),
            ('status', models.CharField(default='open', max_length=12)), ('version', models.PositiveBigIntegerField(default=1)),
            ('actor_id', models.PositiveBigIntegerField()), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('prompt', models.ForeignKey(on_delete=deletion.PROTECT, related_name='opportunities', to='blog.trackedprompt')),
            ('measurement', models.ForeignKey(blank=True, null=True, on_delete=deletion.PROTECT, to='blog.promptmeasurement')),
            ('competitor', models.ForeignKey(blank=True, null=True, on_delete=deletion.PROTECT, to='blog.competitor')),
            ('post', models.OneToOneField(blank=True, null=True, on_delete=deletion.PROTECT, to='blog.post'))],
            options={'constraints':[models.CheckConstraint(condition=models.Q(priority__in=['high','medium','low']), name='blog_gap_priority_valid'),
                models.CheckConstraint(condition=models.Q(status__in=['open','in_progress','done','dismissed']), name='blog_gap_status_valid')]}),
    ]
