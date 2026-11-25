from django.db import migrations, models
from django.db.models.functions import Length


def sizes(apps, schema_editor):
    Image = apps.get_model('blog', 'CoverImage')
    Image.objects.using(schema_editor.connection.alias).update(size_bytes=Length('data'))


class Migration(migrations.Migration):
    dependencies = [('blog', '0003_coverimage')]
    operations = [
        migrations.AddField('coverimage', 'filename', models.CharField(max_length=120, default='image.jpg')),
        migrations.AddField('coverimage', 'alt', models.CharField(max_length=250, blank=True, default='')),
        migrations.AddField('coverimage', 'caption', models.CharField(max_length=500, blank=True, default='')),
        migrations.AddField('coverimage', 'size_bytes', models.PositiveIntegerField(default=0)),
        migrations.AddField('coverimage', 'version', models.PositiveBigIntegerField(default=1)),
        migrations.AddField('coverimage', 'object_key', models.CharField(max_length=100, blank=True, default='')),
        migrations.RunPython(sizes, migrations.RunPython.noop),
    ]
