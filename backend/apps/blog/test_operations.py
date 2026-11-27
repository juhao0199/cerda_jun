from django.test import TestCase, Client, override_settings
from . import tests as helpers
from .models import Post, ContentTask, TrackedPrompt, ContentOpportunity
from .test_operations_rules import TASK, CLUSTER

@override_settings(SITE_ORIGIN='http://localhost:3000',CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class OperationsTests(TestCase):
    root=helpers.BlogTests.root
    public=helpers.BlogTests.public
    account=helpers.BlogTests.account
    setUp=helpers.BlogTests.setUp
    write=helpers.BlogTests.write
    change=helpers.BlogTests.change
    article=helpers.BlogTests.article

    def task(self,fields=TASK):
        r=self.write('operations/task',{'action':'save','id':None,'version':None,'fields':fields},self.staff)
        self.assertEqual(r.status_code,200,r.content);return r.json()

    def test_task_and_cluster_conflict(self):
        c=self.write('operations/cluster',{'id':None,'version':None,'fields':CLUSTER},self.staff)
        self.assertEqual(c.status_code,200,c.content)
        t=self.task({**TASK,'clusterId':c.json()['id']})
        move={'action':'move','id':t['id'],'version':t['version'],'stage':'writing','due':'2027-03-01'}
        self.assertEqual(self.write('operations/task',move,self.staff).json()['stage'],'writing')
        self.assertEqual(self.write('operations/task',move,self.staff).status_code,409)
        self.assertEqual(self.owner.get(self.root+'operations/list/?stage=writing').json()['tasks'][0]['due'],'2027-03-01')

    def test_private_draft_and_release_status(self):
        t=self.task();r=self.write('operations/task',{'action':'draft','id':t['id'],'version':t['version'],'slug':self.slug,'category':'Web','summary':'Starter summary'},self.staff)
        self.assertEqual(r.status_code,200,r.content);self.assertEqual(r.json()['release'],'draft');self.assertEqual(self.article().status_code,404)
        self.assertNotIn('Private brief',str(Post.objects.get(slug=self.slug).draft))
        self.assertEqual(self.change('publish',1).status_code,400)
        self.assertEqual(self.change('save',1,self.staff,fields=self.fields).status_code,200)
        self.assertEqual(self.change('publish',2).status_code,200)
        self.assertEqual(self.owner.get(self.root+'operations/list/').json()['tasks'][0]['release'],'published')

    def test_import_once_and_protected_routes(self):
        prompt=TrackedPrompt.objects.create(question='Which AI tools?',language='en',market='SG',intent='commercial',key='test',engines=[],actor_id=1)
        gap=ContentOpportunity.objects.create(prompt=prompt,title='Research AI',brief='Evidence notes',priority='high',actor_id=1)
        data={'action':'import','id':None,'version':None,'opportunityId':gap.pk}
        r=self.write('operations/task',data,self.staff);self.assertEqual(r.status_code,200,r.content);self.assertEqual(r.json()['opportunityId'],gap.pk)
        self.assertEqual(self.write('operations/task',data,self.staff).status_code,409)
        self.assertEqual(self.client.get(self.root+'operations/list/').status_code,403)
        self.assertEqual(Client().get(self.root+'operations/health/').status_code,401)
        self.assertEqual(self.write('operations/task',data,csrf=False).status_code,403)
        self.assertEqual(ContentTask.objects.filter(opportunity=gap).count(),1)
