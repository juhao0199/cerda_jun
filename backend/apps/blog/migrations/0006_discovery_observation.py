from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('blog', '0005_editorial_seo')]
    operations = [migrations.CreateModel(name='DiscoveryObservation', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('mode', models.CharField(max_length=3)), ('engine', models.CharField(max_length=40)),
        ('prompt', models.CharField(max_length=500)), ('target', models.CharField(max_length=160)),
        ('outcome', models.CharField(max_length=12)), ('evidence', models.CharField(max_length=1500)),
        ('actor_id', models.PositiveBigIntegerField()), ('created_at', models.DateTimeField(auto_now_add=True)),
    ], options={'indexes':[models.Index(fields=['mode','-created_at'], name='blog_disc_mode_date_idx')],
                'constraints':[models.CheckConstraint(condition=models.Q(mode__in=['aeo','geo']), name='blog_disc_mode_valid'),
                               models.CheckConstraint(condition=models.Q(outcome__in=['present','absent','inconclusive']), name='blog_disc_result_valid')]})]
