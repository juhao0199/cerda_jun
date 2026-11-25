from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [('blog', '0007_technical_audit')]
    operations = [
        migrations.CreateModel(name='TrackedPrompt', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('question', models.CharField(max_length=500)), ('language', models.CharField(max_length=40)),
            ('market', models.CharField(max_length=80)), ('intent', models.CharField(max_length=20)),
            ('key', models.CharField(max_length=64, unique=True)), ('cadence_days', models.PositiveSmallIntegerField(default=7)),
            ('engines', models.JSONField()), ('active', models.BooleanField(default=True, db_index=True)),
            ('version', models.PositiveBigIntegerField(default=1)), ('actor_id', models.PositiveBigIntegerField()),
            ('created_at', models.DateTimeField(auto_now_add=True)),
        ]),
        migrations.CreateModel(name='PromptMeasurement', fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('engine', models.CharField(max_length=40)), ('observed_at', models.DateTimeField()),
            ('context', models.CharField(max_length=250)), ('answer', models.CharField(max_length=12)),
            ('brand', models.CharField(max_length=12)), ('citation', models.CharField(max_length=12)),
            ('sources', models.JSONField(default=list)), ('evidence', models.CharField(max_length=1500)),
            ('actor_id', models.PositiveBigIntegerField()), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('prompt', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='measurements', to='blog.trackedprompt')),
        ], options={'indexes': [models.Index(fields=['prompt','engine','-observed_at'], name='blog_prompt_engine_time_idx')],
                    'constraints': [models.CheckConstraint(condition=models.Q(answer__in=['present','absent','inconclusive']), name='blog_measure_answer_valid'),
                                    models.CheckConstraint(condition=models.Q(brand__in=['present','absent','inconclusive']), name='blog_measure_brand_valid'),
                                    models.CheckConstraint(condition=models.Q(citation__in=['present','absent','inconclusive']), name='blog_measure_cite_valid')]}),
    ]
