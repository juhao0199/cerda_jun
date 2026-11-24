from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('accounts', '0001_initial')]
    operations = [migrations.AddField(model_name='securityevent', name='target_id',
                                      field=models.BigIntegerField(null=True, db_index=True))]
