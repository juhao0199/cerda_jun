import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [migrations.CreateModel(name='Inquiry', fields=[
        ('reference', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ('request_id', models.UUIDField(editable=False, unique=True)),
        ('email', models.EmailField(max_length=254)), ('payload', models.JSONField()),
        ('created_at', models.DateTimeField(auto_now_add=True)),
        ('status', models.CharField(choices=[('new','New'),('reviewed','Reviewed'),('closed','Closed')], default='new', max_length=8)),
    ], options={'db_table':'studio_inquiries',
        'indexes':[models.Index(fields=['-created_at'],name='studio_created_idx'),models.Index(fields=['email','-created_at'],name='studio_email_created_idx')],
        'constraints':[models.CheckConstraint(condition=models.Q(status__in=['new','reviewed','closed']),name='studio_status_valid')]})]
