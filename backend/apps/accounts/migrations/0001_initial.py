from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='AccountSecurity', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('role', models.CharField(choices=[('owner','Owner'),('staff','Staff'),('client','Client')], max_length=10)),
            ('version', models.PositiveBigIntegerField(default=1)), ('totp_ciphertext', models.BinaryField()),
            ('last_totp_step', models.BigIntegerField(default=-1)),
            ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='security_profile', to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.AddConstraint(model_name='accountsecurity', constraint=models.CheckConstraint(condition=models.Q(role__in=['owner','staff','client']), name='account_role_valid')),
        migrations.CreateModel(name='AttemptBucket', fields=[('key',models.CharField(max_length=64,primary_key=True,serialize=False)),('count',models.PositiveIntegerField(default=0)),('expires_at',models.DateTimeField(db_index=True))]),
        migrations.CreateModel(name='SecurityEvent', fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('created_at',models.DateTimeField(auto_now_add=True,db_index=True)),('action',models.CharField(max_length=48)),('actor_id',models.BigIntegerField(null=True)),('subject',models.CharField(blank=True,max_length=64))], options={'ordering':['-created_at','-pk']}),
    ]
