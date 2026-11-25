from django.db import migrations, models
import django.db.models.deletion


def seed(apps, schema_editor):
    Post = apps.get_model('blog', 'Post')
    Revision = apps.get_model('blog', 'Revision')
    Term = apps.get_model('blog', 'EditorialTerm')
    db = schema_editor.connection.alias
    Term.objects.using(db).get_or_create(kind='author', key='cedar & cursor', defaults={'name': 'Cedar & Cursor'})
    for post in Post.objects.using(db).iterator():
        for fields in (post.draft, post.published or {}):
            for kind, names in [('category', [fields.get('category')]), ('tag', fields.get('tags', []))]:
                for name in names:
                    if name:
                        Term.objects.using(db).get_or_create(kind=kind, key=name.casefold(), defaults={'name': name})
        dates = Revision.objects.using(db).filter(post=post, action__in=['publish','import']).order_by('created_at')
        first = dates.first()
        last = dates.last()
        Post.objects.using(db).filter(pk=post.pk).update(
            first_published_at=(post.published_at if first and last and first.pk == last.pk and post.published_at else first.created_at if first else post.published_at),
            published_modified_at=post.published_at or (last.created_at if last else None))


class Migration(migrations.Migration):
    dependencies = [('blog', '0004_media_library')]
    operations = [
        migrations.AddField('post', 'first_published_at', models.DateTimeField(null=True, default=None)),
        migrations.AddField('post', 'published_modified_at', models.DateTimeField(null=True, default=None)),
        migrations.CreateModel(name='EditorialTerm', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('kind', models.CharField(max_length=8)), ('name', models.CharField(max_length=80)),
            ('key', models.CharField(max_length=240)), ('active', models.BooleanField(default=True)),
            ('version', models.PositiveBigIntegerField(default=1)),
        ], options={'constraints': [models.UniqueConstraint(fields=('kind','key'), name='blog_term_unique'),
            models.CheckConstraint(condition=models.Q(kind__in=['category','tag','author']), name='blog_term_kind_valid')]}),
        migrations.CreateModel(name='SlugAlias', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('slug', models.SlugField(max_length=100, unique=True)), ('created_at', models.DateTimeField(auto_now_add=True)),
            ('post', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='aliases', to='blog.post')),
        ]),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
