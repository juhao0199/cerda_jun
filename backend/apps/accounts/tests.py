import json
import time
from unittest.mock import patch
import pyotp
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
from .models import AccountSecurity, SecurityEvent
from .security import encrypt_secret

@override_settings(SITE_ORIGIN='http://localhost:3000', CSRF_TRUSTED_ORIGINS=['http://localhost:3000'],
                   PASSWORD_HASHERS=['django.contrib.auth.hashers.PBKDF2PasswordHasher'])
class AuthSecurityTests(TestCase):
    root='/api/v1/'
    origin='http://localhost:3000'
    password='Long-unique-test-passphrase!42'

    def setUp(self):
        self.client=Client(enforce_csrf_checks=True)
        self.secret=pyotp.random_base32()
        self.user=get_user_model().objects.create_user(username='owner',password=self.password)
        self.profile=AccountSecurity.objects.create(user=self.user,role='owner',totp_ciphertext=encrypt_secret(self.secret))
        self.now=int(time.time())
        clock=patch('apps.accounts.security.time.time',side_effect=lambda:self.now)
        clock.start(); self.addCleanup(clock.stop)

    def post(self,path,data,csrf=True,origin=None,client=None):
        client=client or self.client
        token=client.get(self.root+'auth/csrf/').json()['csrfToken'] if csrf else ''
        return client.post(self.root+path+'/',json.dumps(data),content_type='application/json',
                           HTTP_X_CSRFTOKEN=token,HTTP_ORIGIN=origin or self.origin)

    def login(self,client=None,code=None,username='owner',password=None):
        with patch('apps.accounts.security.time.time',return_value=self.now):
            return self.post('auth/login',{'username':username,'password':password or self.password,
                             'code':code or pyotp.TOTP(self.secret).at(self.now)},client=client)

    def test_login_csrf_and_origin(self):
        payload={'username':'owner','password':self.password,'code':'123456'}
        self.assertEqual(self.post('auth/login',payload,csrf=False).status_code,403)
        self.assertEqual(self.post('auth/login',payload,origin='https://evil.example').status_code,403)

    def test_anonymous_access_denied(self):
        for path in ('auth/me/','staff/inquiries/','staff/security-events/'):
            self.assertEqual(self.client.get(self.root+path).status_code,401)

    def test_mfa_and_generic_failure(self):
        code=pyotp.TOTP(self.secret).at(self.now)
        wrong='000000' if code!='000000' else '111111'
        a=self.login(code=wrong); b=self.login(username='missing')
        self.assertEqual(a.status_code,401);self.assertEqual(a.json(),b.json())
        self.assertEqual(self.login().status_code,200)

    def test_otp_replay(self):
        self.assertEqual(self.login().status_code,200)
        self.assertEqual(self.login(client=Client(enforce_csrf_checks=True)).status_code,401)

    def test_role_and_revocation(self):
        self.profile.role='client';self.profile.save()
        self.assertEqual(self.login().status_code,200)
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,200)
        self.assertEqual(self.client.get(self.root+'staff/inquiries/').status_code,403)
        self.assertEqual(self.client.get(self.root+'staff/security-events/').status_code,403)
        AccountSecurity.objects.filter(pk=self.profile.pk).update(version=2)
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,401)

    def test_staff_owner_boundary(self):
        self.profile.role='staff';self.profile.save()
        self.assertEqual(self.login().status_code,200)
        self.assertEqual(self.client.get(self.root+'staff/inquiries/').status_code,200)
        self.assertEqual(self.client.get(self.root+'staff/security-events/').status_code,403)

    def test_session_cookie_and_logout(self):
        response=self.login(); self.assertEqual(response.status_code,200)
        self.assertTrue(any(c['httponly'] for c in response.cookies.values()))
        self.assertIn('no-store',response['Cache-Control'])
        self.assertEqual(self.post('auth/logout',{},csrf=False).status_code,403)
        self.assertEqual(self.post('auth/logout',{}).status_code,200)
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,401)

    def test_rate_limit(self):
        for _ in range(5):self.assertEqual(self.login(password='wrong').status_code,401)
        self.assertEqual(self.login().status_code,429)

    def test_no_legacy_admin(self):
        self.assertEqual(self.client.get('/internal/admin/').status_code,404)

    def test_audit_no_credentials(self):
        self.login(); self.assertTrue(SecurityEvent.objects.filter(action='login.success').exists())
        self.assertNotIn(self.password,str(list(SecurityEvent.objects.values())))

    def test_idle_session(self):
        self.assertEqual(self.login().status_code,200)
        session=self.client.session;session['cedar_seen']=int(time.time())-1801;session.save()
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,401)

    def test_password_change_revokes_sessions(self):
        self.assertEqual(self.login().status_code,200)
        self.now+=30
        other=Client(enforce_csrf_checks=True);self.assertEqual(self.login(client=other).status_code,200)
        self.now+=30
        with patch('apps.accounts.security.time.time',return_value=self.now):
            response=self.post('auth/password',{'currentPassword':self.password,'newPassword':'Another-unique-passphrase!928','code':pyotp.TOTP(self.secret).at(self.now)})
        self.assertEqual(response.status_code,200)
        self.assertEqual(other.get(self.root+'auth/me/').status_code,401)

    def test_session_created_without_mfa_is_rejected(self):
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,401)

    def test_absolute_session_expiry(self):
        self.assertEqual(self.login().status_code,200)
        session=self.client.session;session['cedar_started']=self.now-8*3600;session.save()
        self.assertEqual(self.client.get(self.root+'auth/me/').status_code,401)

    def test_owner_can_read_audit_but_not_mutate_it(self):
        self.assertEqual(self.login().status_code,200)
        self.assertEqual(self.client.get(self.root+'staff/security-events/').status_code,200)
        self.assertEqual(self.post('staff/security-events',{}).status_code,405)
