import json, time
from datetime import date, timedelta
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from apps.accounts.models import AccountSecurity, SecurityEvent
from apps.inquiries.models import Inquiry
from .models import Quotation, Revision
from .pricing import normalize

@override_settings(SITE_ORIGIN='http://localhost:3000',CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class QuotationTests(TestCase):
    root='/api/v1/staff/quotations/'
    def account(self,role):
        user=get_user_model().objects.create_user(username=role)
        AccountSecurity.objects.create(user=user,role=role,totp_ciphertext=b'test')
        b=Client(enforce_csrf_checks=True);b.force_login(user);s=b.session;now=int(time.time());s.update({'cedar_started':now,'cedar_seen':now,'cedar_version':1,'cedar_mfa':True});s.save();return b,user
    def setUp(self):
        self.owner,_=self.account('owner');self.staff,self.employee=self.account('staff');self.client,_=self.account('client')
        self.lead=Inquiry.objects.create(request_id=uuid4(),email='contact@example.com',payload={'name':'Test recipient','company':'Example','overview':'Project'})
        self.id=str(uuid4());self.fields={'title':'Website','currency':'USD','validUntil':(date.today()+timedelta(days=30)).isoformat(),'items':[{'description':'Design','quantity':'1.50','unitPrice':'10.01'},{'description':'Development','quantity':'2','unitPrice':'50'}],'discount':'10','tax':'7','paymentTerms':'50% deposit, 50% on delivery','notes':''}
    def post(self,path,body,b=None,csrf=True):
        b=b or self.owner;token=b.get('/api/v1/auth/csrf/').json()['csrfToken'] if csrf else ''
        return b.post(self.root+path+'/',json.dumps(body),content_type='application/json',HTTP_ORIGIN='http://localhost:3000',HTTP_X_CSRFTOKEN=token)
    def create(self,b=None):return self.post('create',{'id':self.id,'lead':str(self.lead.pk),'fields':self.fields},b)
    def action(self,action,version,b=None,**extra):return self.post('change',{'id':self.id,'version':version,'action':action,**extra},b)
    def test_totals_and_strict_fields(self):
        s=normalize(self.fields);self.assertEqual(s['total'],'110.77');self.assertEqual(s['subtotal'],'115.02');self.assertEqual(s['discountAmount'],'11.50');self.assertEqual(s['taxAmount'],'7.25')
        self.assertEqual(self.post('create',{'id':self.id,'lead':str(self.lead.pk),'fields':{**self.fields,'total':'0'}}).status_code,400)
        self.assertEqual(self.post('create',{'id':self.id,'lead':str(self.lead.pk),'fields':{**self.fields,'discount':'101'}}).status_code,400)
    def test_idempotency_and_revision_history(self):
        self.assertEqual(self.create().status_code,201);self.assertEqual(self.create().status_code,200);self.assertEqual(Revision.objects.count(),1)
        self.assertEqual(self.action('issue',1).status_code,200);self.assertEqual(self.action('save',2,fields=self.fields).status_code,409)
        self.assertEqual(self.action('revise',2).status_code,200);self.assertEqual(self.action('save',2,fields=self.fields).status_code,409)
        self.assertEqual(self.action('save',3,fields={**self.fields,'title':'New title'}).status_code,200)
        self.assertEqual(Revision.objects.get(version=2).snapshot['title'],'Website');self.assertEqual(Quotation.objects.get().version,4)
        self.assertEqual(self.action('void',4).status_code,200);self.assertEqual(self.action('revise',5).status_code,409)
        self.assertEqual(SecurityEvent.objects.filter(action__startswith='quotation.').count(),5)
    def test_scope_and_archive(self):
        self.assertEqual(self.create(self.staff).status_code,404);self.assertEqual(self.create(self.client).status_code,403);self.assertEqual(self.create().status_code,201)
        path=self.root+f'detail/{self.id}/';self.assertEqual(self.staff.get(path).status_code,404);self.assertEqual(self.staff.get(self.root+'list/').json()['results'],[])
        self.lead.assigned_to=self.employee;self.lead.save(update_fields=['assigned_to']);self.assertEqual(self.staff.get(path).status_code,200);self.assertEqual(self.action('save',1,self.staff,fields=self.fields).status_code,200)
        self.lead.assigned_to=None;self.lead.save(update_fields=['assigned_to']);self.assertEqual(self.action('issue',2,self.staff).status_code,404)
        from django.utils import timezone
        self.lead.crm_archived_at=timezone.now();self.lead.save(update_fields=['crm_archived_at']);self.assertTrue(self.owner.get(path).json()['readOnly']);self.assertEqual(self.action('issue',2).status_code,409)
    def test_list_search_and_status_counts(self):
        self.assertEqual(self.create().status_code,201)
        response=self.owner.get(self.root+'list/',{'q':'Test recipient'}).json()
        self.assertEqual(response['counts']['draft'],1);self.assertEqual(response['results'][0]['total'],'110.77')
        self.assertEqual(self.owner.get(self.root+'list/',{'status':'issued'}).json()['results'],[])
        self.assertEqual(self.owner.get(self.root+'list/',{'q':'not found'}).json()['results'],[])
        self.assertEqual(self.client.get(self.root+'list/').status_code,403)
    def test_csrf_and_pdf(self):
        self.assertEqual(self.post('create',{'id':self.id,'lead':str(self.lead.pk),'fields':self.fields},csrf=False).status_code,403)
        self.assertEqual(self.create().status_code,201);path=self.root+f'pdf/{self.id}/1/'
        self.assertEqual(self.staff.get(path).status_code,404);r=self.owner.get(path);self.assertEqual(r.status_code,200);self.assertEqual(r['Content-Type'],'application/pdf');self.assertTrue(r.content.startswith(b'%PDF'));self.assertIn('no-store',r['Cache-Control'])
    def test_expired_and_zero_not_issued(self):
        self.fields['validUntil']='2000-01-01';self.assertEqual(self.create().status_code,201);self.assertEqual(self.action('issue',1).status_code,400)
        self.assertEqual(self.action('save',1,fields={**self.fields,'validUntil':'2099-01-01','discount':'100'}).status_code,200);self.assertEqual(self.action('issue',2).status_code,400)
