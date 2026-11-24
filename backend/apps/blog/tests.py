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
