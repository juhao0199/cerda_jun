import json
import time
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.test import Client as Browser, TestCase, override_settings
from apps.accounts.models import AccountSecurity, SecurityEvent
from .models import Client, Inquiry, LeadActivity


@override_settings(SITE_ORIGIN='http://localhost:3000', CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class CRMTests(TestCase):
    root = '/api/v1/staff/crm/'
    origin = 'http://localhost:3000'

    def setUp(self):
        self.lead = Inquiry.objects.create(request_id=uuid4(),email='customer@example.com',payload={'name':'Customer','company':'Example','overview':'Build a new website.'})
        self.browser = self.account('owner')

    def account(self, role, username=None):
        user = get_user_model().objects.create_user(username=username or role)
        AccountSecurity.objects.create(user=user,role=role,totp_ciphertext=b'not-a-real-secret')
        browser = Browser(enforce_csrf_checks=True)
        browser.force_login(user)
        session=browser.session
        now=int(time.time())
        session.update({'cedar_started':now,'cedar_seen':now,'cedar_version':1,'cedar_mfa':True})
        session.save()
        return browser

    def post(self,path,body,browser=None,csrf=True,origin=None):
        browser=browser or self.browser
        token=browser.get('/api/v1/auth/csrf/').json()['csrfToken'] if csrf else ''
        return browser.post(self.root+path+'/',json.dumps(body),content_type='application/json',HTTP_ORIGIN=origin or self.origin,HTTP_X_CSRFTOKEN=token)

    def stage(self,stage,version=1,**kw):
        return self.post('stage',{'reference':str(self.lead.pk),'stage':stage,'version':version},**kw)

    def test_anonymous_and_client_denied(self):
        for path in ('overview/','leads/','clients/',f'leads/{self.lead.pk}/'):
            self.assertEqual(Browser().get(self.root+path).status_code,401)
        client=self.account('client')
        for path in ('overview/','leads/','clients/',f'leads/{self.lead.pk}/'):
            self.assertEqual(client.get(self.root+path).status_code,403)
        self.assertEqual(self.stage('qualified',browser=client).status_code,403)
        self.assertEqual(self.post('notes',{'reference':str(self.lead.pk),'version':1,'message':'x'},browser=client).status_code,403)

    def test_staff_access(self):
        staff=self.account('staff')
        self.assertEqual(staff.get(self.root+'overview/').status_code,200)
        self.assertEqual(self.stage('qualified',browser=staff).status_code,404)
        self.assertEqual(self.assign_to('staff').status_code,200)
        self.assertEqual(self.stage('qualified',version=2,browser=staff).status_code,200)

    def test_csrf_origin_and_revocation(self):
        self.assertEqual(self.stage('qualified',csrf=False).status_code,403)
        self.assertEqual(self.stage('qualified',origin='https://evil.example').status_code,403)
        AccountSecurity.objects.filter(role='owner').update(version=2)
        self.assertEqual(self.browser.get(self.root+'leads/').status_code,401)

    def test_pipeline_and_conversion(self):
        self.assertEqual(self.stage('won').status_code,409)
        self.assertEqual(self.stage('qualified').status_code,200)
        self.assertEqual(self.stage('proposal',2).status_code,200)
        self.assertEqual(self.stage('won',3).status_code,200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.crm_stage,'won')
        self.assertEqual(self.lead.status,'closed')
        self.assertEqual(self.lead.client.email,'customer@example.com')
        self.assertEqual(Client.objects.count(),1)
        self.assertEqual(LeadActivity.objects.count(),3)
        self.assertEqual(SecurityEvent.objects.filter(action='crm.stage.changed').count(),3)
        self.assertEqual(self.stage('lost',4).status_code,409)

    def test_reuse_existing_client_without_overwriting(self):
        existing=Client.objects.create(email=self.lead.email,name='Existing')
        Inquiry.objects.filter(pk=self.lead.pk).update(crm_stage='proposal')
        self.assertEqual(self.stage('won').status_code,200)
        self.lead.refresh_from_db(); existing.refresh_from_db()
        self.assertEqual(self.lead.client_id,existing.pk)
        self.assertEqual(existing.name,'Existing')

    def test_stale_version_and_notes(self):
        self.assertEqual(self.stage('qualified').status_code,200)
        self.assertEqual(self.stage('lost').status_code,409)
        body={'reference':str(self.lead.pk),'version':2,'message':'Follow up on Monday.'}
        self.assertEqual(self.post('notes',body).status_code,201)
        self.assertEqual(self.post('notes',body).status_code,409)
        self.assertEqual(LeadActivity.objects.filter(action='note.added').count(),1)
        self.assertNotIn(body['message'],str(list(SecurityEvent.objects.values())))

    def test_strict_fields_and_missing_reference(self):
        body={'reference':str(self.lead.pk),'version':1,'stage':'qualified'}
        self.assertEqual(self.post('stage',{**body,'role':'owner'}).status_code,400)
        self.assertEqual(self.post('stage',{**body,'version':True}).status_code,400)
        self.assertEqual(self.post('stage',{**body,'reference':str(uuid4())}).status_code,404)
        self.assertEqual(self.post('notes',{'reference':str(self.lead.pk),'version':1,'message':'x'*1001}).status_code,400)

    def test_filters_pagination_and_private_response(self):
        self.assertEqual(self.browser.get(self.root+'leads/?page=0').status_code,400)
        self.assertEqual(self.browser.get(self.root+'leads/?q=a&q=b').status_code,400)
        self.assertEqual(self.browser.get(self.root+'leads/?sort=email').status_code,400)
        for i in range(26):
            Inquiry.objects.create(request_id=uuid4(),email=f'other{i}@example.com',payload={'name':'Other'})
        response=self.browser.get(self.root+'leads/?page=1')
        self.assertEqual(len(response.json()['results']),25)
        self.assertTrue(response.json()['hasMore'])
        self.assertIn('no-store',response['Cache-Control'])
        self.assertEqual(len(self.browser.get(self.root+'leads/?q=Customer').json()['results']),1)
        self.assertNotIn('payload',response.json()['results'][0])

    def test_service_and_utc_date_filters(self):
        from datetime import datetime, timezone
        Inquiry.objects.filter(pk=self.lead.pk).update(
            payload={'name': 'Customer', 'discovery': {'type': 'website'}},
            created_at=datetime(2026, 11, 24, 23, 59, 59, tzinfo=timezone.utc))
        other = Inquiry.objects.create(request_id=uuid4(), email='other@example.com', payload={'discovery': {'type': 'ai'}})
        Inquiry.objects.filter(pk=other.pk).update(created_at=datetime(2026, 11, 25, tzinfo=timezone.utc))
        for query in ('service=website', 'from=2026-11-24&to=2026-11-24', 'service=website&stage=new'):
            response = self.browser.get(self.root + 'leads/?' + query)
            self.assertEqual(response.status_code, 200)
            self.assertEqual([x['reference'] for x in response.json()['results']], [str(self.lead.pk)])
        for query in ('service=invalid', 'from=2026-02-30', 'to=9999-12-31', 'from=2026-11-25&to=2026-11-24', 'service=website&service=ai', 'from=20261124'):
            self.assertEqual(self.browser.get(self.root + 'leads/?' + query).status_code, 400)
        self.assertEqual(self.account('client').get(self.root + 'leads/?service=website').status_code, 403)

    def assign_to(self, username, version=1, **kwargs):
        user_id = str(get_user_model().objects.get(username=username).pk) if username is not None else None
        return self.post('assign', {'reference': str(self.lead.pk), 'version': version, 'assigneeId': user_id}, **kwargs)

    def test_assignment_default_deny_and_legacy_endpoint(self):
        staff = self.account('staff')
        self.assertEqual(staff.get(self.root+'overview/').json()['total'], 0)
        self.assertEqual(staff.get(self.root+'leads/').json()['results'], [])
        self.assertEqual(staff.get('/api/v1/staff/inquiries/').json()['results'], [])
        self.assertEqual(staff.get(self.root+f'leads/{self.lead.pk}/').status_code, 404)
        self.assertEqual(self.assign_to('staff').status_code, 200)
        self.assertEqual(staff.get(self.root+'overview/').json()['total'], 1)
        self.assertEqual(len(staff.get('/api/v1/staff/inquiries/').json()['results']), 1)
        hidden = Inquiry.objects.create(request_id=uuid4(), email='hidden@example.com', payload={'name':'Hidden'})
        self.assertEqual([r['reference'] for r in staff.get(self.root+'leads/').json()['results']], [str(self.lead.pk)])
        self.assertEqual(staff.get(self.root+'leads/?q=Hidden').json()['results'], [])
        self.assertEqual(staff.get(self.root+f'leads/{hidden.pk}/').status_code, 404)
        self.assertEqual(staff.get(self.root+'overview/').json()['total'], 1)
        self.assertFalse(staff.get(self.root+f'leads/{self.lead.pk}/').json()['canAssign'])
        self.assertTrue(self.browser.get(self.root+f'leads/{self.lead.pk}/').json()['canAssign'])

    def test_reassignment_revokes_record_access_and_invalidates_version(self):
        a = self.account('staff', 'staff-a')
        b = self.account('staff', 'staff-b')
        self.assertEqual(self.assign_to('staff-a').status_code, 200)
        self.assertEqual(self.assign_to('staff-b', version=2).status_code, 200)
        self.assertEqual(a.get(self.root+f'leads/{self.lead.pk}/').status_code, 404)
        self.assertEqual(self.stage('qualified', version=3, browser=a).status_code, 404)
        self.assertEqual(self.post('notes', {'reference':str(self.lead.pk),'version':3,'message':'Forbidden'}, browser=a).status_code, 404)
        self.assertEqual(b.get(self.root+f'leads/{self.lead.pk}/').status_code, 200)
        self.assertEqual(self.stage('qualified', version=2, browser=b).status_code, 409)
        self.assertEqual(self.stage('qualified', version=3, browser=b).status_code, 200)
        self.assertEqual(self.assign_to(None, version=4).status_code, 200)
        self.assertEqual(b.get(self.root+'overview/').json()['total'], 0)
        self.assertEqual(SecurityEvent.objects.filter(action='crm.assignment.changed').count(), 3)
        self.assertEqual(LeadActivity.objects.filter(action='assignment.changed').count(), 3)

    def test_owner_only_and_invalid_targets(self):
        staff = self.account('staff')
        client = self.account('client')
        self.assertEqual(self.assign_to('staff', browser=staff).status_code, 403)
        self.assertEqual(self.assign_to('staff', browser=client).status_code, 403)
        self.assertEqual(self.assign_to('owner').status_code, 400)
        self.assertEqual(self.assign_to('client').status_code, 400)
        self.assertEqual(self.assign_to('staff', csrf=False).status_code, 403)
        self.assertEqual(self.assign_to('staff', origin='https://evil.example').status_code, 403)
        self.assertEqual(self.assign_to('staff', version=2).status_code, 409)
        self.assertEqual(self.post('assign', {'reference':str(self.lead.pk),'version':True,'assigneeId':None}).status_code, 400)
        get_user_model().objects.filter(username='staff').update(is_active=False)
        self.assertEqual(self.assign_to('staff').status_code, 400)
        self.lead.refresh_from_db()
        self.assertIsNone(self.lead.assigned_to_id)
        self.assertEqual(self.lead.crm_version, 1)

    def test_client_directory_counts_follow_assigned_leads(self):
        staff = self.account('staff')
        linked = Client.objects.create(email='linked@example.com', name='Linked')
        Client.objects.create(email='hidden@example.com', name='Hidden')
        Inquiry.objects.filter(pk=self.lead.pk).update(client=linked)
        self.assertEqual(staff.get(self.root+'clients/').json()['results'], [])
        self.assertEqual(self.assign_to('staff').status_code, 200)
        self.assertEqual([r['id'] for r in staff.get(self.root+'clients/').json()['results']], [str(linked.pk)])
        self.assertEqual(staff.get(self.root+'overview/').json()['clients'], 1)
        self.assertEqual(staff.get(self.root+'clients/?q=hidden').json()['results'], [])
        self.assertEqual(self.assign_to(None,version=2).status_code, 200)
        self.assertEqual(staff.get(self.root+'overview/').json()['clients'], 0)
        self.assertEqual(self.browser.get(self.root+'overview/').json()['clients'], 2)

    def test_assignment_role_revocation_and_noop(self):
        staff = self.account('staff')
        self.assertEqual(self.assign_to('staff').status_code, 200)
        self.assertEqual(self.assign_to('staff', version=2).json()['version'], 2)
        self.assertEqual(LeadActivity.objects.filter(action='assignment.changed').count(), 1)
        AccountSecurity.objects.filter(user__username='staff').update(role='client', version=2)
        self.assertEqual(staff.get(self.root+'leads/').status_code, 401)
        self.assertEqual(self.assign_to('staff', version=2).status_code, 400)

    def manual_fields(self, **overrides):
        return {'name':'New contact','company':'=formula','email':'manual@example.com','overview':'Build an application.',
                'service':'software','source':'linkedin','priority':'high','expectedValue':'1250.50','currency':'USD',
                'expectedCloseDate':'2027-02-01','tags':['Enterprise','Follow up'],'allowDuplicate':False,**overrides}

    def test_manual_create_idempotency_duplicate_and_permissions(self):
        fields=self.manual_fields(requestId=str(uuid4()))
        staff=self.account('staff')
        client=self.account('client')
        self.assertEqual(self.post('create',fields,browser=staff).status_code,403)
        self.assertEqual(self.post('create',fields,browser=client).status_code,403)
        self.assertEqual(self.post('create',fields,csrf=False).status_code,403)
        self.assertEqual(self.post('create',fields,origin='https://evil.example').status_code,403)
        response=self.post('create',fields)
        self.assertEqual(response.status_code,201)
        ref=response.json()['reference']
        self.assertEqual(response.json()['expectedValue'],'1250.50')
        self.assertEqual(self.post('create',fields).json()['reference'],ref)
        self.assertEqual(LeadActivity.objects.filter(action='lead.created').count(),1)
        self.assertEqual(self.post('create',{**fields,'name':'Changed'}).status_code,409)
        duplicate={**fields,'requestId':str(uuid4())}
        self.assertEqual(self.post('create',duplicate).json()['code'],'duplicate')
        self.assertEqual(self.post('create',{**duplicate,'allowDuplicate':True}).status_code,201)
        self.assertEqual(staff.get(self.root+'leads/').json()['results'],[])
        self.assertEqual(len(self.browser.get(self.root+'leads/?source=linkedin&priority=high&service=software').json()['results']),2)

    def test_manual_validation_no_mass_assignment(self):
        base=self.manual_fields(requestId=str(uuid4()))
        for invalid in ({'expectedValue':'1e9'},{'expectedValue':True},{'expectedValue':'-1'}, {'expectedValue':'1.001'},
                        {'expectedCloseDate':'2027-02-30'},{'tags':['Tag','tag']},{'tags':['a,b']}, {'currency':'ZZZ'},
                        {'service':'invalid'},{'source':[]},{'priority':'critical'},{'email':'wrong'}, {'assigned_to_id':1}):
            self.assertEqual(self.post('create',{**base,**invalid}).status_code,400,invalid)
        self.assertEqual(Inquiry.objects.count(),1)

    def test_edit_scope_version_and_original_submission(self):
        staff=self.account('staff')
        original=self.lead.payload.copy()
        data=self.manual_fields(reference=str(self.lead.pk),version=1,email=self.lead.email)
        self.assertEqual(self.post('edit',data,browser=staff).status_code,404)
        self.assertEqual(self.assign_to('staff').status_code,200)
        self.assertEqual(self.post('edit',data,browser=staff).status_code,409)
        data['version']=2
        self.assertEqual(self.post('edit',{**data,'email':'changed@example.com'},browser=staff).status_code,403)
        self.assertEqual(self.post('edit',data,browser=staff).status_code,200)
        self.lead.refresh_from_db()
        self.assertEqual(self.lead.payload,original)
        self.assertEqual(self.lead.crm_contact['name'],'New contact')
        self.assertEqual(staff.get(self.root+'leads/?q=New%20contact').json()['results'][0]['reference'],str(self.lead.pk))
        self.assertEqual(self.post('edit',data,browser=staff).status_code,409)
        self.assertEqual(self.assign_to(None,version=3).status_code,200)
        self.assertEqual(self.post('edit',{**data,'version':4},browser=staff).status_code,404)

    def test_archive_and_restore_all_entrypoints(self):
        staff=self.account('staff')
        self.assertEqual(self.assign_to('staff').status_code,200)
        body={'reference':str(self.lead.pk),'version':2,'archived':True}
        self.assertEqual(self.post('archive',body,browser=staff).status_code,403)
        self.assertEqual(self.post('archive',body).status_code,200)
        self.assertEqual(self.browser.get(self.root+'overview/').json()['total'],0)
        self.assertEqual(self.browser.get(self.root+'overview/?archived=1').json()['total'],1)
        self.assertEqual(self.browser.get(self.root+'leads/?archived=1').json()['results'][0]['reference'],str(self.lead.pk))
        self.assertEqual(staff.get(self.root+'leads/?archived=1').status_code,403)
        self.assertEqual(staff.get(self.root+f'leads/{self.lead.pk}/').status_code,404)
        self.assertEqual(staff.get('/api/v1/staff/inquiries/').json()['results'],[])
        self.assertEqual(self.stage('qualified',version=3).status_code,409)
        self.assertEqual(self.post('notes',{'reference':str(self.lead.pk),'version':3,'message':'test'}).status_code,409)
        self.assertEqual(self.assign_to(None,version=3).status_code,409)
        self.assertEqual(self.post('archive',{**body,'version':3,'archived':False}).status_code,200)
        self.assertEqual(staff.get(self.root+'overview/').json()['total'],1)

    def test_csv_export_scoped_audited_and_safe(self):
        staff=self.account('staff')
        client=self.account('client')
        self.assertEqual(self.assign_to('staff').status_code,200)
        Inquiry.objects.filter(pk=self.lead.pk).update(payload={'name':'=1+1','company':'\t@formula'})
        Inquiry.objects.create(request_id=uuid4(),email='hidden@example.com',payload={'name':'Hidden'})
        response=self.post('export',{},browser=staff)
        self.assertEqual(response.status_code,200)
        self.assertIn('text/csv',response['Content-Type'])
        content=response.content.decode('utf-8-sig')
        self.assertIn("'=1+1",content)
        self.assertIn("'\t@formula",content)
        self.assertNotIn('hidden@example.com',content)
        self.assertEqual(self.post('export',{},browser=client).status_code,403)
        self.assertEqual(self.post('export',{},browser=staff,csrf=False).status_code,403)
        self.assertEqual(SecurityEvent.objects.filter(action='crm.leads.exported').count(),1)
