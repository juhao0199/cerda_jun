from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('inquiries', '0002_crm'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.AddField(
        model_name='inquiry', name='assigned_to',
        field=models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
            on_delete=django.db.models.deletion.PROTECT, related_name='assigned_inquiries'),
    )]
