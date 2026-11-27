from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('blog','0012_publishing_workflow')]
    operations = [
        migrations.CreateModel(name='TopicCluster', fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(max_length=120)),('keyword',models.CharField(max_length=100)),('market',models.CharField(blank=True,default='',max_length=100)),('intent',models.CharField(default='informational',max_length=20)),('keywords',models.JSONField(default=list)),('notes',models.TextField(blank=True,default='')),('version',models.PositiveBigIntegerField(default=1)),('archived',models.BooleanField(default=False)),('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
        ]),
        migrations.CreateModel(name='ContentTask',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('title',models.CharField(max_length=160)),('stage',models.CharField(default='idea',max_length=12)),('priority',models.CharField(default='medium',max_length=8)),('keyword',models.CharField(blank=True,default='',max_length=100)),('audience',models.CharField(blank=True,default='',max_length=160)),('intent',models.CharField(default='informational',max_length=20)),('brief',models.TextField(blank=True,default='')),('outline',models.TextField(blank=True,default='')),('due',models.DateField(blank=True,null=True)),('assignee_id',models.PositiveBigIntegerField(blank=True,null=True)),('actor_id',models.PositiveBigIntegerField()),('version',models.PositiveBigIntegerField(default=1)),('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('cluster',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,to='blog.topiccluster')),('post',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,to='blog.post')),('opportunity',models.OneToOneField(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,to='blog.contentopportunity')),
        ],options={'constraints':[models.CheckConstraint(condition=models.Q(stage__in=['idea','research','writing','optimizing','ready','archived']),name='content_task_stage_valid'),models.CheckConstraint(condition=models.Q(priority__in=['low','medium','high']),name='content_task_priority_valid')],'indexes':[models.Index(fields=['stage','due'],name='content_task_stage_due')]}),
    ]
