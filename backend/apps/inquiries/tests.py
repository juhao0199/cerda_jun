from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient
from .models import Inquiry

@override_settings(SITE_ORIGIN='http://localhost:3000')
class InquiryAPITests(TransactionTestCase):
    endpoint = '/api/v1/inquiries/'
    origin = 'http://localhost:3000'

    def payload(self, **overrides):
        return {'requestId': str(uuid4()), 'overview': 'Build a website for our business.', 'name':'Test Client',
            'email':'client@example.com', 'company':'', 'consent':True, 'website':'',
            'discovery':{'type':'website','goal':'design','stage':'ready','features':['cms']}, **overrides}

    def post(self, payload):
        return APIClient().post(self.endpoint, payload, format='json', HTTP_ORIGIN=self.origin)

    def test_create_and_authoritative_price(self):
        response = self.post(self.payload(estimate={'low':1}))
        self.assertEqual(response.status_code,201)
        self.assertEqual(Inquiry.objects.get().payload['estimate']['low'],900)

    def test_idempotency_and_conflict(self):
        payload = self.payload()
        first = self.post(payload)
        again = self.post(payload)
        self.assertEqual(again.status_code,200)
        self.assertEqual(first.json(),again.json())
        self.assertEqual(self.post({**payload,'name':'Different'}).status_code,409)
        self.assertEqual(Inquiry.objects.count(),1)

    def test_validation(self):
        for payload in [self.payload(consent='true'), self.payload(website='bot'), self.payload(name=123),
                        self.payload(discovery={'type':'website','goal':'design','stage':'ready','features':['dashboard']})]:
            self.assertEqual(self.post(payload).status_code,400)
        self.assertEqual(Inquiry.objects.count(),0)

    def test_origin(self):
        response = APIClient().post(self.endpoint,self.payload(),format='json',HTTP_ORIGIN='https://invalid.example')
        self.assertEqual(response.status_code,403)

    def test_rate_limit(self):
        for _ in range(5): self.assertEqual(self.post(self.payload()).status_code,201)
        self.assertEqual(self.post(self.payload()).status_code,429)

    def test_concurrent_retry(self):
        payload = self.payload()
        def send():
            close_old_connections()
            try: return self.post(payload).status_code
            finally: connection.close()
        with ThreadPoolExecutor(max_workers=4) as pool:
            codes = list(pool.map(lambda _:send(),range(4)))
        self.assertEqual(sorted(codes),[200,200,200,201])
        self.assertEqual(Inquiry.objects.count(),1)
