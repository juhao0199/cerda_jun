from django.db import migrations, models
import django.db.models.deletion as deletion


class Migration(migrations.Migration):
    dependencies = [('blog','0009_competitor_opportunities')]
    operations = [
        migrations.AddField(model_name='competitor',name='kind',field=models.CharField(max_length=12,default='unclassified',choices=[('unclassified','Unclassified'),('direct','Direct competitor'),('indirect','Indirect competitor'),('reference','Reference brand')])),
        migrations.CreateModel(name='CompetitorIntelligence',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('report',models.JSONField()),('actor_id',models.PositiveBigIntegerField()),('created_at',models.DateTimeField(auto_now_add=True)),
            ('competitor',models.ForeignKey(on_delete=deletion.PROTECT,related_name='intelligence_reports',to='blog.competitor'))]),
    ]
