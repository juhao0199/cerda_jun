from datetime import timedelta
from copy import deepcopy
from django.test import TestCase, Client, override_settings
from django.utils import timezone
from apps.accounts.models import AccountSecurity
from . import tests as helpers
from .models import PublishingPlan, PublishingEvent
from .publishing import run_due
from .website_rules import DEFAULTS


@override_settings(SITE_ORIGIN='http://localhost:3000', CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class PublishingTests(TestCase):
    root=helpers.BlogTests.root
    public=helpers.BlogTests.public
    account=helpers.BlogTests.account
    write=helpers.BlogTests.write
    create=helpers.BlogTests.create
    change=helpers.BlogTests.change
    article=helpers.BlogTests.article
    setUp=helpers.BlogTests.setUp

    def submit(self, kind='article', version=1):
        res=self.write('publishing/submit',{'kind':kind,'slug':self.slug if kind=='article' else '', 'targetVersion':version,'note':'Review draft'},self.staff)
        self.assertEqual(res.status_code,200,res.content)
        return res.json()

    def act(self,p,action,browser=None,note='',when=None,code=200):
        res=self.write('publishing/change',{'id':p['id'],'version':p['version'],'targetVersion':p['currentVersion'],'action':action,'note':note,'scheduledAt':when},browser)
        self.assertEqual(res.status_code,code,res.content)
        return res.json()

    def reload(self,p):
        return self.owner.get(self.root+f"publishing/detail/{p['id']}/").json()

    def schedule(self,p):
        p=self.act(p,'approve')
        p=self.act(p,'schedule',when=(timezone.now()+timedelta(hours=1)).isoformat())
        PublishingPlan.objects.filter(pk=p['id']).update(scheduled_at=timezone.now()-timedelta(seconds=1))
        return p

    def test_article_review_return_resubmit_and_publish(self):
        self.assertEqual(self.create().status_code,201)
        p=self.submit()
        self.assertEqual(self.article().status_code,404)
        self.assertEqual(self.change('publish',1).status_code,409)
        self.act(p,'approve',self.staff,code=403)
        p=self.act(p,'return',note='Improve headline')
        self.assertEqual(self.change('save',1,self.staff,fields={**self.fields,'title':'Reviewed title'}).status_code,200)
        p=self.act(self.reload(p),'resubmit',self.staff)
        p=self.act(p,'approve')
        p=self.act(p,'publish')
        self.assertEqual(p['status'],'published')
        self.assertEqual(self.article().json()['title'],'Reviewed title')
        self.assertEqual(PublishingEvent.objects.filter(plan_id=p['id']).count(),5)

    def test_schedule_runs_once_and_preserves_publication(self):
        self.assertEqual(self.create().status_code,201)
        p=self.schedule(self.submit())
        self.assertEqual(run_due()['published'],1)
        self.assertEqual(run_due()['published'],0)
        self.assertEqual(self.reload(p)['status'],'published')
        self.assertEqual(self.article().status_code,200)

    def test_edited_draft_blocks_due_publication(self):
        self.assertEqual(self.create().status_code,201)
        p=self.schedule(self.submit())
        self.assertEqual(self.change('save',1,self.staff,fields={**self.fields,'title':'Not reviewed'}).status_code,200)
        self.assertEqual(run_due()['stale'],1)
        self.assertEqual(self.article().status_code,404)
        self.assertTrue(self.reload(p)['stale'])

    def test_revoked_approval_blocks_runner(self):
        self.assertEqual(self.create().status_code,201)
        p=self.schedule(self.submit())
        AccountSecurity.objects.filter(role='owner').update(version=2)
        self.assertEqual(run_due()['stale'],1)
        self.assertEqual(self.article().status_code,404)
        self.assertEqual(PublishingPlan.objects.get(pk=p['id']).status,'stale')

    def test_website_and_permissions(self):
        fields=deepcopy(DEFAULTS); fields['homeTitle']='Reviewed website'
        self.assertEqual(self.write('website/change',{'action':'save','version':1,'fields':fields},self.staff).status_code,200)
        p=self.submit('website',2)
        self.assertEqual(self.write('website/change',{'action':'publish','version':2}).status_code,409)
        self.assertEqual(self.client.get(self.root+'publishing/list/').status_code,403)
        self.assertEqual(Client().get(self.root+'publishing/list/').status_code,401)
        self.assertEqual(self.write('publishing/submit',{'kind':'website','slug':'','targetVersion':2,'note':''},csrf=False).status_code,403)
        p=self.act(p,'approve')
        p=self.act(p,'publish')
        self.assertEqual(Client().get(self.public+'website/').json()['fields']['homeTitle'],'Reviewed website')
        self.assertEqual(p['status'],'published')

    def test_duplicate_and_cancel(self):
        self.assertEqual(self.create().status_code,201)
        p=self.submit()
        self.assertEqual(self.write('publishing/submit',{'kind':'article','slug':self.slug,'targetVersion':1,'note':''}).status_code,409)
        self.act(p,'cancel',self.staff)
        self.assertEqual(self.change('publish',1).status_code,200)
