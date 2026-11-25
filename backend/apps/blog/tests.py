import json
import time
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from apps.accounts.models import AccountSecurity, SecurityEvent
from .models import Post, Revision


@override_settings(SITE_ORIGIN='http://localhost:3000', CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class BlogTests(TestCase):
    root = '/api/v1/staff/blog/'
    public = '/api/v1/public/blog/'

    def account(self, role):
        user = get_user_model().objects.create_user(username=role)
        AccountSecurity.objects.create(user=user, role=role, totp_ciphertext=b'test')
        b = Client(enforce_csrf_checks=True)
        b.force_login(user)
        session = b.session
        now = int(time.time())
        session.update({'cedar_started': now, 'cedar_seen': now, 'cedar_version': 1, 'cedar_mfa': True})
        session.save()
        return b

    def setUp(self):
        self.owner = self.account('owner')
        self.staff = self.account('staff')
        self.client = self.account('client')
        self.fields = {'title': 'Private article', 'summary': 'A summary', 'category': 'Web', 'tags': ['Design'],
                       'sections': [{'heading': 'Introduction', 'body': 'Private body'}],
                       'seoTitle': '', 'seoDescription': '', 'cover': 'web'}
        self.slug = 'test-article'

    def write(self, endpoint, data, browser=None, csrf=True, origin='http://localhost:3000'):
        browser = browser or self.owner
        token = browser.get('/api/v1/auth/csrf/').json()['csrfToken'] if csrf else ''
        return browser.post(self.root + endpoint + '/', json.dumps(data), content_type='application/json', HTTP_ORIGIN=origin, HTTP_X_CSRFTOKEN=token)

    def create(self, browser=None, **kwargs):
        return self.write('create', {'slug': self.slug, 'fields': self.fields, **kwargs}, browser)

    def change(self, action, version, browser=None, **extra):
        return self.write('change', {'slug': self.slug, 'version': version, 'action': action, **extra}, browser)

    def article(self):
        return Client().get(self.public + 'detail/' + self.slug + '/')

    def test_seed_preserves_existing_urls(self):
        for slug in ('business-website-budget', 'when-to-build-custom-software', 'practical-ai-for-business'):
            response = Client().get(self.public + 'detail/' + slug + '/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(len(response.json()['sections']), 3)
            self.assertEqual(Revision.objects.get(post__slug=slug, version=1).action, 'import')

    def test_draft_publish_and_unpublished_changes(self):
        self.assertEqual(self.create(self.staff).status_code, 201)
        self.assertEqual(self.article().status_code, 404)
        self.assertNotIn(self.slug, [x['slug'] for x in Client().get(self.public + 'list/').json()['results']])
        self.assertEqual(self.change('publish', 1, self.staff).status_code, 403)
        self.assertEqual(self.change('publish', 1).status_code, 200)
        self.assertEqual(self.article().json()['title'], 'Private article')
        self.assertEqual(self.change('save', 2, self.staff, fields={**self.fields, 'title': 'Unpublished edit'}).status_code, 200)
        self.assertEqual(self.article().json()['title'], 'Private article')
        self.assertNotIn('Unpublished edit', Client().get(self.public + 'list/').content.decode())
        self.assertNotIn('draft', self.article().json())
        self.assertNotIn('history', self.article().json())
        self.assertEqual(self.change('publish', 3).status_code, 200)
        self.assertEqual(self.article().json()['title'], 'Unpublished edit')

    def test_archive_restore_and_history(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.change('publish', 1).status_code, 200)
        self.assertEqual(self.change('archive', 2, self.staff).status_code, 403)
        self.assertEqual(self.change('archive', 2).status_code, 200)
        self.assertEqual(self.article().status_code, 404)
        self.assertEqual(self.change('save', 3, fields=self.fields).status_code, 409)
        self.assertEqual(self.change('restore', 3).status_code, 200)
        self.assertEqual(self.article().status_code, 404)
        self.assertEqual(self.change('publish', 4).status_code, 200)
        self.assertEqual(self.article().status_code, 200)
        response = self.owner.get(self.root + f'revision/{self.slug}/2/')
        self.assertEqual(response.json()['status'], 'published')
        self.assertEqual(response.json()['snapshot']['title'], self.fields['title'])
        self.assertEqual(Revision.objects.filter(post__slug=self.slug).count(), 5)
        self.assertEqual(SecurityEvent.objects.filter(action__startswith='blog.').count(), 5)

    def test_roles_and_csrf(self):
        self.assertEqual(Client().get(self.root+'list/').status_code, 401)
        self.assertEqual(self.client.get(self.root+'list/').status_code, 403)
        self.assertEqual(self.create(self.client).status_code, 403)
        self.assertEqual(self.write('create', {'slug': self.slug, 'fields': self.fields}, csrf=False).status_code, 403)
        self.assertEqual(self.write('create', {'slug': self.slug, 'fields': self.fields}, origin='https://example.org').status_code, 403)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.client.get(self.root + f'detail/{self.slug}/').status_code, 403)
        self.assertEqual(self.client.get(self.root + f'revision/{self.slug}/1/').status_code, 403)

    def test_strict_validation_and_concurrency(self):
        self.assertEqual(self.create(slug='Bad Slug').status_code, 400)
        self.assertEqual(self.create(fields={**self.fields, 'cover': 'https://example.org/x.svg'}).status_code, 400)
        self.assertEqual(self.create(fields={**self.fields, 'tags': ['AI','ai']}).status_code, 400)
        self.assertEqual(self.create(fields={**self.fields, 'status': 'published'}).status_code, 400)
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(self.create().status_code, 409)
        self.assertEqual(self.change('save', 1, fields={**self.fields, 'title': 'New title'}).status_code, 200)
        self.assertEqual(self.change('publish', 1).status_code, 409)
        self.assertEqual(Post.objects.get(slug=self.slug).version, 2)
        self.assertEqual(Revision.objects.filter(post__slug=self.slug).count(), 2)

    def test_listing_and_public_no_store(self):
        self.assertEqual(self.create().status_code, 201)
        result = self.staff.get(self.root+'list/', {'q':'Private', 'status':'draft'}).json()
        self.assertEqual([r['slug'] for r in result['results']], [self.slug])
        self.assertEqual(result['counts']['draft'], 1)
        self.assertEqual(self.staff.get(self.root+'list/?page=0').status_code, 400)
        self.assertEqual(self.change('publish', 1).status_code, 200)
        self.assertIn('no-store', self.article()['Cache-Control'])
        self.assertEqual(Client().get(self.public+'list/?page=1&page=2').status_code, 400)

    def upload(self, raw=None, browser=None, csrf=True, origin='http://localhost:3000'):
        from io import BytesIO
        from PIL import Image
        if raw is None:
            buffer = BytesIO()
            Image.new('RGB', (64, 32), 'gray').save(buffer, format='PNG')
            raw = buffer.getvalue()
        browser = browser or self.owner
        token = browser.get('/api/v1/auth/csrf/').json()['csrfToken'] if csrf else ''
        return browser.post(self.root+'cover/upload/', raw, content_type='application/octet-stream',
                            HTTP_ORIGIN=origin, HTTP_X_CSRFTOKEN=token)

    def test_cover_private_until_published_and_replacement(self):
        from .models import CoverImage
        from io import BytesIO
        from PIL import Image
        first = self.upload(browser=self.staff)
        self.assertEqual(first.status_code, 201)
        cover = first.json()['cover']
        path = 'cover/'+cover[7:]+'/'
        self.assertEqual(Client().get(self.public+path).status_code, 404)
        self.assertEqual(Client().get(self.root+path).status_code, 401)
        self.assertEqual(self.client.get(self.root+path).status_code, 403)
        private = self.staff.get(self.root+path)
        self.assertEqual(private.status_code, 200)
        self.assertEqual(private['Content-Type'], 'image/jpeg')
        self.assertEqual(Image.open(BytesIO(private.content)).size, (64, 32))
        self.assertEqual(self.create(fields={**self.fields, 'cover':cover}).status_code, 201)
        self.assertEqual(Client().get(self.public+path).status_code, 404)
        self.assertEqual(self.change('publish', 1).status_code, 200)
        self.assertEqual(Client().get(self.public+path).status_code, 200)
        second = self.upload().json()['cover']
        path2 = 'cover/'+second[7:]+'/'
        self.assertEqual(self.change('save', 2, self.staff, fields={**self.fields, 'cover':second}).status_code, 200)
        self.assertEqual(Client().get(self.public+path).status_code, 200)
        self.assertEqual(Client().get(self.public+path2).status_code, 404)
        self.assertEqual(self.change('publish', 3).status_code, 200)
        self.assertEqual(Client().get(self.public+path).status_code, 404)
        self.assertEqual(Client().get(self.public+path2).status_code, 200)
        self.assertEqual(self.change('archive', 4).status_code, 200)
        self.assertEqual(Client().get(self.public+path2).status_code, 404)
        self.assertEqual(self.owner.get(self.root+path).status_code, 200)
        self.assertEqual(CoverImage.objects.count(), 2)

    def test_cover_upload_rejects_unauthorized_and_invalid_input(self):
        from .models import CoverImage
        self.assertEqual(self.upload(browser=self.client).status_code, 403)
        self.assertEqual(self.upload(csrf=False).status_code, 403)
        self.assertEqual(self.upload(origin='https://example.org').status_code, 403)
        self.assertEqual(self.upload(raw=b'<svg xmlns="http://www.w3.org/2000/svg"/>').status_code, 400)
        self.assertEqual(self.upload(raw=b'x'*(5*1024*1024+1)).status_code, 413)
        self.assertEqual(CoverImage.objects.count(), 0)
        self.assertEqual(self.create(fields={**self.fields, 'cover':'upload:12345678-1234-1234-1234-123456789abc'}).status_code, 400)

    def test_cover_upload_audit_and_rate_limit(self):
        for _ in range(5):
            self.assertEqual(self.upload().status_code, 201)
        self.assertEqual(self.upload().status_code, 429)
        self.assertEqual(SecurityEvent.objects.filter(action='blog.cover.upload').count(), 5)

    def test_rich_document_and_inline_image_publication(self):
        ref = self.upload().json()['cover']
        image = {'type':'studioImage','attrs':{'ref':ref,'alt':'Architecture diagram','caption':'System overview'}}
        paragraph = {'type':'paragraph','content':[{'type':'text','text':'word '*6000,'marks':[{'type':'bold'}]}]}
        fields = {**self.fields,'sections':[],'document':{'type':'doc','content':[paragraph,image]}}
        self.assertEqual(self.create(fields=fields).status_code,201)
        path = self.public+'cover/'+ref[7:]+'/'
        self.assertEqual(Client().get(path).status_code,404)
        self.assertEqual(self.change('publish',1).status_code,200)
        self.assertEqual(self.article().json()['document']['content'][1],image)
        self.assertEqual(self.article().json()['minutes'],30)
        self.assertEqual(Client().get(path).status_code,200)
        edited = {**fields,'document':{'type':'doc','content':[paragraph]}}
        self.assertEqual(self.change('save',2,self.staff,fields=edited).status_code,200)
        self.assertEqual(Client().get(path).status_code,200)
        self.assertEqual(self.change('publish',3).status_code,200)
        self.assertEqual(Client().get(path).status_code,404)
        self.assertEqual(self.owner.get(self.root+'cover/'+ref[7:]+'/').status_code,200)
        self.assertEqual(self.owner.get(self.root+f'revision/{self.slug}/2/').json()['snapshot']['document']['content'][1],image)

    def test_rich_document_invalid_reference_and_request_limit(self):
        image = {'type':'studioImage','attrs':{'ref':'upload:12345678-1234-1234-1234-123456789abc','alt':'Diagram','caption':''}}
        fields = {**self.fields,'sections':[],'document':{'type':'doc','content':[image]}}
        self.assertEqual(self.create(fields=fields).status_code,400)
        self.assertEqual(self.create(fields={**fields,'document':{'type':'doc','content':[{'type':'script','text':'x'}]}}).status_code,400)
        self.assertEqual(self.create(fields={**self.fields,'summary':'x'*(256*1024)}).status_code,413)
        self.assertEqual(self.create().status_code,201)

    def test_media_metadata_permissions_and_safe_delete(self):
        from .models import CoverImage
        ref = self.upload(browser=self.staff).json()['cover']
        image_id = ref[7:]
        detail = 'media/detail/'+image_id+'/'
        self.assertEqual(self.client.get(self.root+'media/list/').status_code, 403)
        self.assertEqual(Client().get(self.root+detail).status_code, 401)
        self.assertEqual(self.staff.get(self.root+'media/list/').json()['count'], 1)
        self.assertEqual(self.staff.get(self.root+'media/list/').json()['bytes'], len(CoverImage.objects.get(pk=image_id).data))
        payload = {'id':image_id,'version':1,'action':'edit','filename':'Architecture diagram','alt':'System diagram','caption':'Overview'}
        self.assertEqual(self.write('media/change',payload,self.staff,csrf=False).status_code,403)
        self.assertEqual(self.write('media/change',payload,self.staff).status_code,200)
        self.assertEqual(self.write('media/change',payload,self.staff).status_code,409)
        self.assertEqual(self.staff.get(self.root+'media/list/?q=Architecture').json()['results'][0]['id'],image_id)
        delete={'id':image_id,'version':2,'action':'delete'}
        self.assertEqual(self.write('media/change',delete,self.staff).status_code,403)
        self.assertEqual(self.write('media/change',delete).status_code,200)
        self.assertEqual(self.owner.get(self.root+detail).status_code,404)
        self.assertEqual(self.create(fields={**self.fields,'cover':ref}).status_code,400)

    def test_media_retains_history_even_after_reference_removed(self):
        ref=self.upload().json()['cover']; image_id=ref[7:]
        image={'type':'studioImage','attrs':{'ref':ref,'alt':'Diagram','caption':''}}
        fields={**self.fields,'sections':[],'document':{'type':'doc','content':[image]}}
        self.assertEqual(self.create(fields=fields).status_code,201)
        delete={'id':image_id,'version':1,'action':'delete'}
        self.assertEqual(self.write('media/change',delete).status_code,409)
        self.assertEqual(self.change('save',1,fields=self.fields).status_code,200)
        usage=self.owner.get(self.root+'media/detail/'+image_id+'/').json()
        self.assertEqual(usage['articleCount'],0)
        self.assertEqual(usage['revisionCount'],1)
        self.assertEqual(self.write('media/change',delete).status_code,409)

    def test_media_crop_copy_preserves_source(self):
        ref=self.upload().json()['cover']; image_id=ref[7:]
        payload={'id':image_id,'ratio':'square','rotation':90}
        result=self.write('media/derive',payload,self.staff)
        self.assertEqual(result.status_code,201)
        self.assertNotEqual(result.json()['id'],image_id)
        self.assertEqual((result.json()['width'],result.json()['height']),(32,32))
        original=self.owner.get(self.root+'media/detail/'+image_id+'/').json()
        self.assertEqual((original['width'],original['height']),(64,32))
        self.assertEqual(self.write('media/derive',{**payload,'rotation':45}).status_code,400)

    def test_media_s3_storage_private_and_failure(self):
        from unittest.mock import patch
        from .models import CoverImage
        from .object_storage import StorageError
        with patch('apps.blog.object_storage.enabled',return_value=True), patch('apps.blog.object_storage.put',side_effect=StorageError('test')):
            self.assertEqual(self.upload().status_code,503)
            self.assertEqual(CoverImage.objects.count(),0)
        objects={}
        def put(image_id,data):
            key=f'blog/images/{image_id}.jpg';objects[key]=data;return key
        with patch('apps.blog.object_storage.enabled',return_value=True), patch('apps.blog.object_storage.put',side_effect=put), patch('apps.blog.object_storage.get',side_effect=objects.__getitem__):
            ref=self.upload().json()['cover']; asset=CoverImage.objects.get(pk=ref[7:]);path='cover/'+ref[7:]+'/'
            self.assertEqual(bytes(asset.data),b'')
            self.assertEqual(self.owner.get(self.root+path).content,objects[asset.object_key])
            self.assertEqual(Client().get(self.public+path).status_code,404)
            self.assertEqual(self.create(fields={**self.fields,'cover':ref}).status_code,201)
            self.assertEqual(self.change('publish',1).status_code,200)
            self.assertEqual(Client().get(self.public+path).content,objects[asset.object_key])

    def test_editorial_directory_permissions_and_archived_assignments(self):
        add = {'action':'create','kind':'author','name':'Example Writer'}
        self.assertEqual(self.client.get(self.root+'terms/list/').status_code,403)
        self.assertEqual(self.write('terms/change',add,self.staff).status_code,403)
        self.assertEqual(self.write('terms/change',add,csrf=False).status_code,403)
        term=self.write('terms/change',add).json()
        self.assertEqual(self.write('terms/change',{**add,'name':'example writer'}).status_code,409)
        self.assertEqual(self.create(fields={**self.fields,'author':'Unknown Writer'}).status_code,400)
        self.assertEqual(self.create(self.staff,fields={**self.fields,'author':'example writer'}).status_code,201)
        self.assertEqual(self.staff.get(self.root+'terms/list/?kind=tag&q=Design').json()['results'][0]['name'],'Design')
        self.assertEqual(self.write('terms/change',{'action':'archive','id':term['id'],'version':1}).status_code,200)
        self.assertEqual(self.staff.get(self.root+'terms/list/?kind=author&active=1&q=Example').json()['results'],[])
        self.assertEqual(self.create(slug='new-article',fields={**self.fields,'author':'Example Writer'}).status_code,400)
        self.assertEqual(self.change('save',1,self.staff,fields={**self.fields,'author':'Example Writer'}).status_code,200)
        self.assertEqual(self.write('terms/change',{'action':'restore','id':term['id'],'version':1}).status_code,409)
        self.assertEqual(self.write('terms/change',{'action':'restore','id':term['id'],'version':2}).status_code,200)

    def test_published_seo_is_snapshot_and_dates_are_stable(self):
        fields={**self.fields,'noindex':True,'focusKeyword':'private phrase','coverAlt':'Interface diagram'}
        self.assertEqual(self.create(fields=fields).status_code,201)
        self.assertEqual(self.change('publish',1).status_code,200)
        initial=self.article().json()
        self.assertTrue(initial['noindex']);self.assertEqual(initial['coverAlt'],'Interface diagram')
        self.assertNotIn('focusKeyword',initial)
        self.assertEqual(self.change('save',2,self.staff,fields={**fields,'noindex':False}).status_code,200)
        self.assertEqual(self.article().json(),initial)
        self.assertEqual(self.change('publish',3).status_code,200)
        final=self.article().json()
        self.assertFalse(final['noindex']);self.assertEqual(initial['publishedAt'],final['publishedAt'])
        self.assertGreaterEqual(final['modifiedAt'],initial['modifiedAt'])
        self.assertEqual(self.client.get(self.root+'seo/list/').status_code,403)
        self.assertEqual(self.staff.get(self.root+'seo/list/?q=test-article').json()['results'][0]['focusKeyword'],'private phrase')
        self.assertEqual(self.change('save',4,fields={**fields,'noindex':'true'}).status_code,400)

    def test_slug_alias_reservation_and_private_visibility(self):
        self.assertEqual(self.create().status_code,201)
        self.assertEqual(self.change('rename',1,self.staff,newSlug='renamed-article').status_code,403)
        self.assertEqual(self.change('rename',1,newSlug='renamed-article').status_code,200)
        self.assertEqual(self.article().status_code,404)
        self.assertEqual(self.create().status_code,409)
        self.slug='renamed-article'
        self.assertEqual(self.change('publish',2).status_code,200)
        self.assertEqual(Client().get(self.public+'detail/test-article/').json(),{'redirectSlug':'renamed-article'})
        self.assertEqual(self.change('rename',3,newSlug='final-article').status_code,200)
        self.assertEqual(Client().get(self.public+'detail/test-article/').json(),{'redirectSlug':'final-article'})
        self.assertEqual(Client().get(self.public+'detail/renamed-article/').json(),{'redirectSlug':'final-article'})
        self.slug='final-article'
        self.assertEqual(self.change('rename',4,newSlug='test-article').status_code,409)
        self.assertEqual(self.change('archive',4).status_code,200)
        self.assertEqual(Client().get(self.public+'detail/test-article/').status_code,404)
        self.assertEqual(self.article().status_code,404)

    def test_discovery_observations_are_private_separate_and_validated(self):
        payload = {'mode':'aeo','engine':'ChatGPT Search','prompt':'Who provides automation?',
                   'target':'/','outcome':'absent','evidence':'Manual sample, no answer seen.'}
        self.assertEqual(self.write('discovery/create',payload,self.client).status_code,403)
        self.assertEqual(self.write('discovery/create',payload,self.staff,csrf=False).status_code,403)
        self.assertEqual(self.write('discovery/create',{**payload,'target':'https://example.com'},self.staff).status_code,400)
        self.assertEqual(self.write('discovery/create',{**payload,'outcome':'unknown'},self.staff).status_code,400)
        self.assertEqual(self.write('discovery/create',payload,self.staff).status_code,201)
        self.assertEqual(self.write('discovery/create',{**payload,'mode':'geo','outcome':'present'},self.owner).status_code,201)
        self.assertEqual(self.client.get(self.root+'discovery/list/?mode=aeo').status_code,403)
        a=self.staff.get(self.root+'discovery/list/?mode=aeo').json()
        g=self.owner.get(self.root+'discovery/list/?mode=geo').json()
        self.assertEqual(a['counts'],{'absent':1,'inconclusive':0,'present':0})
        self.assertEqual(g['counts'],{'absent':0,'inconclusive':0,'present':1})
        self.assertEqual(a['results'][0]['prompt'],payload['prompt'])
        self.assertNotIn('actor_id',a['results'][0])
        self.assertEqual(self.staff.get(self.root+'discovery/list/?mode=seo').status_code,400)
        self.assertEqual(SecurityEvent.objects.filter(action='blog.discovery.record').count(),2)

    def test_crawler_policy_permissions_version_and_public_output(self):
        from .crawler_policy import default_policy
        policy=self.owner.get(self.root+'technical/policy/').json()
        self.assertEqual(policy['directives'],default_policy())
        self.assertEqual(self.client.get(self.root+'technical/policy/').status_code,403)
        payload={'version':policy['version'],'directives':json.dumps({**policy['directives'],'GPTBot':'block','OAI-SearchBot':'allow'})}
        self.assertEqual(self.write('technical/policy/change',payload,self.staff).status_code,403)
        self.assertEqual(self.write('technical/policy/change',payload,csrf=False).status_code,403)
        self.assertEqual(self.write('technical/policy/change',payload,origin='https://other.example').status_code,403)
        self.assertEqual(self.write('technical/policy/change',{**payload,'directives':'{"bad":"allow"}'}).status_code,400)
        updated=self.write('technical/policy/change',payload);self.assertEqual(updated.status_code,200)
        self.assertEqual(self.write('technical/policy/change',payload).status_code,409)
        response=Client().get(self.public+'robots/');self.assertEqual(response.status_code,200)
        self.assertIn(b'User-agent: GPTBot\nDisallow: /',response.content)
        self.assertIn(b'User-agent: OAI-SearchBot\nAllow: /\nDisallow: /workspace',response.content)
        self.assertEqual(SecurityEvent.objects.filter(action='blog.crawler.change').count(),1)

    @override_settings(SITE_AUDIT_ORIGIN='http://frontend:3000')
    def test_technical_audit_is_owner_run_and_private_append_only(self):
        from unittest.mock import patch
        from .models import SiteAudit
        report={'site':'http://localhost:3000','offset':0,'pages':[{'issues':['Missing title']}],'linksChecked':0}
        self.assertEqual(self.write('technical/run',{'offset':'0'},self.staff).status_code,403)
        self.assertEqual(self.write('technical/run',{'offset':'0','url':'http://evil.test'}).status_code,400)
        self.assertEqual(self.write('technical/run',{'offset':'1'}).status_code,400)
        with patch('apps.blog.technical.run_audit',return_value=report) as measured:
            response=self.write('technical/run',{'offset':'0'});self.assertEqual(response.status_code,201)
            self.assertEqual(measured.call_args.args[0],'http://frontend:3000')
        rid=response.json()['id'];self.assertEqual(SiteAudit.objects.count(),1)
        self.assertEqual(self.client.get(self.root+'technical/history/').status_code,403)
        self.assertEqual(self.client.get(self.root+'technical/report/'+rid+'/').status_code,403)
        self.assertEqual(self.staff.get(self.root+'technical/report/'+rid+'/').json()['report']['policyVersion'],'1')
        self.assertEqual(self.staff.get(self.root+'technical/history/').json()['results'][0]['id'],rid)

    def test_prompt_monitoring_registry_and_measurement(self):
        import uuid
        from django.utils import timezone
        from .models import PromptMeasurement
        form={'question':'Which software studios serve SMEs?','language':'English','market':'Myanmar','intent':'commercial','engines':'ChatGPT Search,Perplexity','cadenceDays':'7'}
        created=self.write('monitoring/create',form,self.staff)
        self.assertEqual(created.status_code,201)
        p=created.json(); self.assertTrue(all(c['due'] for c in p['checks']))
        self.assertEqual(self.write('monitoring/create',{**form,'question':form['question'].upper()},self.staff).status_code,409)
        payload={'id':p['id'],'requestId':str(uuid.uuid4()),'engine':'ChatGPT Search','observedAt':timezone.now().isoformat(), 'context':'Fresh search session, Myanmar', 'answer':'present','brand':'absent','citation':'present','sources':'https://cedarandcursor.com/blog/practical-ai-for-business','evidence':'Reported source link without brand name.'}
        self.assertEqual(self.write('monitoring/record',{**payload,'sources':'https://cedarandcursor.com.other.test/'},self.staff).status_code,400)
        result=self.write('monitoring/record',payload,self.staff)
        self.assertEqual(result.status_code,201)
        self.assertEqual(self.write('monitoring/record',payload,self.staff).status_code,200)
        self.assertEqual(self.write('monitoring/record',{**payload,'brand':'present'},self.staff).status_code,409)
        self.assertEqual(PromptMeasurement.objects.count(),1)
        h=self.staff.get(self.root+'monitoring/history/',{'id':p['id'],'days':'all'}).json()
        self.assertEqual(h['metrics']['citation_present'],1)
        self.assertEqual(h['metrics']['brand_absent'],1)
        self.assertEqual(h['citations'],[{'url':'https://cedarandcursor.com/blog/practical-ai-for-business','checks':1}])
        self.assertFalse(h['prompt']['checks'][0]['due'])
        self.assertTrue(h['prompt']['checks'][1]['due'])
        self.assertEqual(self.write('monitoring/change',{'id':p['id'],'version':p['version'],'action':'archive'},self.staff).status_code,403)
        self.assertEqual(self.write('monitoring/change',{'id':p['id'],'version':p['version'],'action':'archive'}).status_code,200)
        self.assertEqual(self.write('monitoring/record',{**payload,'requestId':str(uuid.uuid4())},self.staff).status_code,409)
        self.assertEqual(self.staff.get(self.root+'monitoring/history/',{'id':p['id']}).json()['metrics']['total'],1)
        self.assertEqual(self.write('monitoring/change',{'id':p['id'],'version':p['version'],'action':'restore'}).status_code,409)

    def test_prompt_monitoring_permissions_and_validation(self):
        form={'question':'What does an AI studio do?','language':'English','market':'Thailand','intent':'informational','engines':'Perplexity','cadenceDays':'14'}
        self.assertEqual(Client().get(self.root+'monitoring/list/').status_code,401)
        self.assertEqual(self.client.get(self.root+'monitoring/list/').status_code,403)
        self.assertEqual(self.client.get(self.root+'monitoring/history/',{'id':'1'}).status_code,403)
        self.assertEqual(self.write('monitoring/create',form,self.client).status_code,403)
        self.assertEqual(self.write('monitoring/create',form,csrf=False).status_code,403)
        self.assertEqual(self.write('monitoring/create',form,origin='https://elsewhere.test').status_code,403)
        self.assertEqual(self.write('monitoring/create',{**form,'engines':'Invalid'}).status_code,400)
        self.assertEqual(self.write('monitoring/create',{**form,'active':'false'}).status_code,400)
        self.assertEqual(self.owner.get(self.root+'monitoring/history/',{'id':'0'}).status_code,400)

    def test_competitor_paired_evidence_and_opportunity_draft(self):
        import uuid
        from django.utils import timezone
        from .models import CompetitorObservation, ContentOpportunity
        p=self.write('monitoring/create',{'question':'Which studios serve SMEs?','language':'English','market':'Myanmar','intent':'commercial','engines':'ChatGPT Search','cadenceDays':'7'},self.staff).json()
        measurement={'id':p['id'],'requestId':str(uuid.uuid4()),'engine':'ChatGPT Search','observedAt':timezone.now().isoformat(),'context':'Fresh session','answer':'present','brand':'absent','citation':'absent','sources':'https://www.example.org/service\nhttps://example.org.other.com/','evidence':'Recorded response.'}
        self.assertEqual(self.write('monitoring/record',measurement,self.staff).status_code,201)
        form={'name':'Example Studio','domain':'example.org','market':'Myanmar'}
        self.assertEqual(self.write('competitors/create',form,self.staff).status_code,403)
        c=self.write('competitors/create',form).json()
        self.assertEqual(self.write('competitors/create',{**form,'domain':'www.example.org'}).status_code,409)
        o={'id':c['id'],'measurementId':measurement['requestId'],'brand':'present','evidence':'Named competitor.'}
        self.assertEqual(self.write('competitors/observe',o,self.staff,csrf=False).status_code,403)
        self.assertEqual(self.write('competitors/observe',o,self.staff).status_code,201)
        self.assertEqual(self.write('competitors/observe',o,self.staff).status_code,409)
        self.assertEqual(CompetitorObservation.objects.get().cited_sources,['https://www.example.org/service'])
        report=self.staff.get(self.root+'competitors/benchmark/',{'id':c['id'],'days':'all'}).json()
        self.assertEqual(report['metrics']['competitorOnly'],1);self.assertEqual(report['metrics']['citationGapSignals'],1)
        gap={'promptId':p['id'],'measurementId':measurement['requestId'],'competitorId':c['id'],'title':'New guide','brief':'PRIVATE COMPETITOR BRIEF','target':'','priority':'high'}
        response=self.write('competitors/gaps/create',gap,self.staff);self.assertEqual(response.status_code,201)
        g=response.json();draft={'id':g['id'],'version':g['version'],'slug':'new-sme-guide','title':'SME Guide','summary':'Public summary','category':'Web','body':'Public draft text'}
        self.assertEqual(self.write('competitors/gaps/draft',draft,self.staff).status_code,201)
        self.assertEqual(self.write('competitors/gaps/draft',draft,self.staff).status_code,409)
        post=Post.objects.get(slug='new-sme-guide');self.assertEqual(post.status,'draft');self.assertIsNone(post.published)
        self.assertNotIn('PRIVATE COMPETITOR BRIEF',str(post.draft));self.assertEqual(ContentOpportunity.objects.get().post_id,post.pk)
        self.assertEqual(Client().get(self.public+'detail/new-sme-guide/').status_code,404)
        self.assertEqual(self.staff.get(self.root+'competitors/coverage/',{'q':'Public draft text'}).json()['matchCount'],0)
        self.assertEqual(self.write('change',{'slug':post.slug,'version':1,'action':'publish'},self.owner).status_code,200)
        self.assertEqual(self.staff.get(self.root+'competitors/coverage/',{'q':'Public draft text'}).json()['matchCount'],1)

    def test_competitor_permissions_and_version_guards(self):
        for path in ('list','benchmark','gaps','coverage'):
            self.assertEqual(self.client.get(self.root+'competitors/'+path+'/').status_code,403)
        form={'name':'Example Studio','domain':'cedarandcursor.com','market':'Myanmar'}
        self.assertEqual(self.write('competitors/create',form).status_code,400)
        c=self.write('competitors/create',{**form,'domain':'example.org'}).json()
        change={'id':c['id'],'version':c['version'],'action':'archive'}
        self.assertEqual(self.write('competitors/change',change,self.staff).status_code,403)
        self.assertEqual(self.write('competitors/change',change).status_code,200)
        self.assertEqual(self.write('competitors/change',change).status_code,409)
        self.assertEqual(self.write('competitors/gaps/create',{'promptId':'1','measurementId':'','competitorId':c['id'],'title':'Gap','brief':'Evidence','target':'','priority':'high'},self.staff).status_code,400)
