import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('blog', '0002_seed_existing')]
    operations = [migrations.CreateModel(name='CoverImage', fields=[
        ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ('data', models.BinaryField(editable=False)),
        ('width', models.PositiveIntegerField()),
        ('height', models.PositiveIntegerField()),
        ('actor_id', models.PositiveBigIntegerField()),
        ('created_at', models.DateTimeField(auto_now_add=True)),
    ])]
