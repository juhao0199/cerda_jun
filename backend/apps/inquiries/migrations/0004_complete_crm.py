from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('inquiries', '0003_inquiry_assigned_to')]
    operations = [
        migrations.AddField(model_name='inquiry', name='crm_contact', field=models.JSONField(default=dict, blank=True)),
        migrations.AddField(model_name='inquiry', name='crm_service', field=models.CharField(max_length=16, null=True, blank=True)),
        migrations.AddField(model_name='inquiry', name='crm_source', field=models.CharField(max_length=16, default='website', db_index=True)),
        migrations.AddField(model_name='inquiry', name='crm_priority', field=models.CharField(max_length=8, default='normal', db_index=True)),
        migrations.AddField(model_name='inquiry', name='crm_value', field=models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)),
        migrations.AddField(model_name='inquiry', name='crm_currency', field=models.CharField(max_length=3, default='USD')),
        migrations.AddField(model_name='inquiry', name='crm_close_date', field=models.DateField(null=True, blank=True)),
        migrations.AddField(model_name='inquiry', name='crm_tags', field=models.JSONField(default=list, blank=True)),
        migrations.AddField(model_name='inquiry', name='crm_archived_at', field=models.DateTimeField(null=True, blank=True, db_index=True)),
    ]
