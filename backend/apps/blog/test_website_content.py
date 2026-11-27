from copy import deepcopy
from django.test import TestCase, Client, override_settings
from . import tests as helpers
from .models import WebsiteRevision
from .website_rules import DEFAULTS


@override_settings(SITE_ORIGIN='http://localhost:3000', CSRF_TRUSTED_ORIGINS=['http://localhost:3000'])
class WebsiteContentTests(TestCase):
    root = '/api/v1/staff/blog/'
    public = '/api/v1/public/blog/website/'
    account = helpers.BlogTests.account
    write = helpers.BlogTests.write

    def setUp(self):
        self.owner = self.account('owner')
        self.staff = self.account('staff')
        self.client = self.account('client')

    def test_save_publish_restore_and_conflict(self):
        fields = deepcopy(DEFAULTS)
        fields['homeTitle'] = 'New homepage title'
        fields['focusKeyword'] = 'private planning'
        fields['homeNoindex'] = True
        result = self.write('website/change', {'action':'save','version':1,'fields':fields}, self.staff)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(Client().get(self.public).json()['fields']['homeTitle'], DEFAULTS['homeTitle'])
        self.assertEqual(self.write('website/change', {'action':'publish','version':2}, self.staff).status_code, 403)
        self.assertEqual(self.write('website/change', {'action':'publish','version':1}).status_code, 409)
        self.assertEqual(self.write('website/change', {'action':'publish','version':2}).status_code, 200)
        published = Client().get(self.public).json()
        self.assertEqual(published['fields']['homeTitle'], 'New homepage title')
        self.assertTrue(published['fields']['homeNoindex'])
        self.assertNotIn('focusKeyword', published['fields'])
        self.assertNotIn('history', published)
        fields['homeTitle'] = 'Different draft'
        self.assertEqual(self.write('website/change', {'action':'save','version':3,'fields':fields}).status_code, 200)
        self.assertEqual(self.write('website/change', {'action':'restore','version':4,'revision':2}).status_code, 200)
        self.assertEqual(Client().get(self.public).json(), published)
        self.assertEqual(WebsiteRevision.objects.count(),4)

    def test_roles_csrf_and_invalid_payload(self):
        url = self.root + 'website/detail/'
        self.assertEqual(self.client.get(url).status_code,403)
        self.assertEqual(Client().get(url).status_code,401)
        self.assertEqual(self.staff.get(url).status_code,200)
        payload={'action':'save','version':1,'fields':DEFAULTS}
        self.assertEqual(self.write('website/change',payload,self.client).status_code,403)
        self.assertEqual(self.write('website/change',payload,csrf=False).status_code,403)
        self.assertEqual(self.write('website/change',payload,origin='https://untrusted.example').status_code,403)
        self.assertEqual(self.write('website/change',{**payload,'fields':{} }).status_code,400)
