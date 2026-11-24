import uuid
from django.db import migrations, models
import django.db.models.deletion


def backfill(apps, schema_editor):
    Inquiry = apps.get_model('inquiries', 'Inquiry')
    rows = Inquiry.objects.using(schema_editor.connection.alias)
    rows.filter(status='reviewed').update(crm_stage='qualified')
    # A historical closed inquiry is not evidence of a sale; require manual review.
    rows.filter(status='closed').update(crm_stage='qualified')


class Migration(migrations.Migration):
    dependencies = [('inquiries', '0001_initial')]
    operations = [
        migrations.CreateModel(name='Client', fields=[
            ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
            ('email', models.EmailField(max_length=254, unique=True)),
            ('name', models.CharField(max_length=120)), ('company', models.CharField(max_length=160, blank=True)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
        ]),
        migrations.AddField(model_name='inquiry', name='crm_stage', field=models.CharField(max_length=12, choices=[('new','New'),('qualified','Qualified'),('proposal','Proposal'),('won','Won'),('lost','Lost')], default='new', db_index=True)),
        migrations.AddField(model_name='inquiry', name='crm_version', field=models.PositiveBigIntegerField(default=1)),
        migrations.AddField(model_name='inquiry', name='client', field=models.ForeignKey(to='inquiries.client', related_name='inquiries', null=True, blank=True, on_delete=django.db.models.deletion.PROTECT)),
        migrations.AddConstraint(model_name='inquiry', constraint=models.CheckConstraint(condition=models.Q(crm_stage__in=['new','qualified','proposal','won','lost']), name='crm_stage_valid')),
        migrations.CreateModel(name='LeadActivity', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('actor_id', models.PositiveBigIntegerField()), ('action', models.CharField(max_length=24)),
            ('message', models.CharField(max_length=1000, blank=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('inquiry', models.ForeignKey(to='inquiries.inquiry', related_name='crm_activity', on_delete=django.db.models.deletion.PROTECT)),
        ], options={'ordering':['-created_at','-pk'], 'indexes':[models.Index(fields=['inquiry','-created_at','-id'], name='crm_activity_order_idx')]}),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
