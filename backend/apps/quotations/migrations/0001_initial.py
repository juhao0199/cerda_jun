import uuid
import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):
    initial = True
    dependencies = [('inquiries', '0004_complete_crm')]
    operations = [
        migrations.CreateModel(name='Quotation', fields=[
            ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ('version', models.PositiveBigIntegerField(default=1)),
            ('status', models.CharField(db_index=True, default='draft', max_length=8)),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('lead', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='quotations', to='inquiries.inquiry')),
        ], options={'constraints':[models.CheckConstraint(condition=models.Q(status__in=['draft','issued','void']), name='quotation_status_valid')]}),
        migrations.CreateModel(name='Revision', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('version', models.PositiveBigIntegerField()), ('status', models.CharField(max_length=8)), ('snapshot', models.JSONField()),
            ('actor_id', models.PositiveBigIntegerField()), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('quotation', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='revisions', to='quotations.quotation')),
        ], options={'constraints':[models.UniqueConstraint(fields=('quotation','version'), name='quotation_revision_unique')]}),
    ]
