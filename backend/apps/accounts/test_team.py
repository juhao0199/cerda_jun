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
class TeamSecurityTests(TestCase):
    password = 'Long-unique-team-passphrase!42'
    origin = 'http://localhost:3000'
    root = '/api/v1/'

    def setUp(self):
        self.owner, self.owner_secret = self.create_account('team-owner', 'owner')
        self.staff, self.staff_secret = self.create_account('team-staff', 'staff')
        self.client_user, self.client_secret = self.create_account('team-client', 'client')
        self.browser = Client(enforce_csrf_checks=True)
        self.clock = int(time.time())
        clock = patch('apps.accounts.security.time.time', side_effect=lambda: self.clock)
        clock.start(); self.addCleanup(clock.stop)

    def create_account(self, username, role):
        user = get_user_model().objects.create_user(username=username, password=self.password)
        secret = pyotp.random_base32()
        AccountSecurity.objects.create(user=user, role=role, totp_ciphertext=encrypt_secret(secret))
        return user, secret

    def post(self, browser, path, body, csrf=True, origin=None):
        token = browser.get(self.root + 'auth/csrf/').json()['csrfToken'] if csrf else ''
        return browser.post(self.root + path + '/', json.dumps(body), content_type='application/json',
                            HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN=origin or self.origin)

    def login(self, browser, user, secret):
        response = self.post(browser, 'auth/login', {'username': user.username, 'password': self.password,
                                                     'code': pyotp.TOTP(secret).at(self.clock)})
        self.assertEqual(response.status_code, 200)

    def payload(self, **changes):
        return {'id': str(self.staff.pk), 'version': '1', 'action': 'revoke', 'password': self.password,
                'code': pyotp.TOTP(self.owner_secret).at(self.clock), **changes}

    def action(self, **changes):
        return self.post(self.browser, 'staff/team/action', self.payload(**changes))

    def login_owner(self):
        self.login(self.browser, self.owner, self.owner_secret)
        self.clock += 30

    def test_anonymous_staff_client_denied(self):
        for path in ('staff/team/', 'staff/security-center/'):
            self.assertEqual(self.browser.get(self.root + path).status_code, 401)
        self.assertEqual(self.action().status_code, 401)
        for user, secret in ((self.staff, self.staff_secret), (self.client_user, self.client_secret)):
            browser = Client(enforce_csrf_checks=True)
            self.login(browser, user, secret)
            for path in ('staff/team/', 'staff/security-center/'):
                self.assertEqual(browser.get(self.root + path).status_code, 403)
            self.assertEqual(self.post(browser, 'staff/team/action', self.payload()).status_code, 403)

    def test_listing_filters_and_no_secrets(self):
        self.login_owner()
        response = self.browser.get(self.root + 'staff/team/', {'role': 'staff', 'search': 'TEAM'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r['username'] for r in response.json()['results']], ['team-staff'])
        self.assertEqual(set(response.json()['results'][0]), {'id','username','role','active','version','lastLogin','protected'})
        self.assertNotIn(self.staff_secret, response.content.decode())
        for suffix in ('?role=superuser', '?page=1001', '?role=staff&role=client', '?unexpected=1'):
            self.assertEqual(self.browser.get(self.root + 'staff/team/' + suffix).status_code, 400)

    def test_csrf_origin_and_mass_assignment(self):
        self.login_owner()
        self.assertEqual(self.post(self.browser, 'staff/team/action', self.payload(), csrf=False).status_code, 403)
        self.assertEqual(self.post(self.browser, 'staff/team/action', self.payload(), origin='https://evil.example').status_code, 403)
        self.assertEqual(self.action(is_superuser='true').status_code, 400)
        self.assertEqual(self.action(action='role', role='owner').status_code, 400)
        self.assertEqual(self.action(id=str(self.owner.pk)).status_code, 403)
        other, _ = self.create_account('other-owner', 'owner')
        self.assertEqual(self.action(id=str(other.pk)).status_code, 403)

    def test_revoke_existing_session_and_audit(self):
        staff_browser = Client(enforce_csrf_checks=True)
        self.login(staff_browser, self.staff, self.staff_secret)
        self.login_owner()
        response = self.action()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['version'], '2')
        self.assertEqual(staff_browser.get(self.root + 'auth/me/').status_code, 401)
        event = SecurityEvent.objects.get(action='team.revoke')
        self.assertEqual(event.actor_id, self.owner.pk)
        self.assertEqual(event.target_id, self.staff.pk)
        self.assertEqual(event.subject, '')
        self.assertNotIn(self.password, str(list(SecurityEvent.objects.values())))
        logs = self.browser.get(self.root + 'staff/security-center/', {'category':'team','account':str(self.staff.pk)}).json()
        self.assertEqual(logs['results'][0]['targetId'], str(self.staff.pk))

    def test_bad_password_stale_version_and_otp_replay(self):
        self.login_owner()
        self.assertEqual(self.action(password='wrong').status_code, 403)
        self.assertEqual(self.action(version='2').status_code, 409)
        self.assertEqual(self.action().status_code, 200)
        self.assertEqual(self.action(version='2').status_code, 403)  # same TOTP cannot be reused
        self.staff.security_profile.refresh_from_db()
        self.assertEqual(self.staff.security_profile.version, 2)

    def test_disable_enable_and_role(self):
        self.login_owner()
        self.assertEqual(self.action(action='disable').status_code, 200)
        self.staff.refresh_from_db(); self.assertFalse(self.staff.is_active)
        self.clock += 30
        self.assertEqual(self.action(action='enable', version='2').status_code, 200)
        self.staff.refresh_from_db(); self.assertTrue(self.staff.is_active)
        self.clock += 30
        self.assertEqual(self.action(action='role', role='client', version='3').status_code, 200)
        self.staff.security_profile.refresh_from_db()
        self.assertEqual(self.staff.security_profile.role, 'client')

    def test_security_pagination_and_read_only(self):
        self.login_owner()
        SecurityEvent.objects.bulk_create([SecurityEvent(action='team.revoke', actor_id=self.owner.pk, target_id=self.staff.pk) for _ in range(31)])
        response = self.browser.get(self.root + 'staff/security-center/', {'category':'team', 'page':'1'}).json()
        self.assertEqual(len(response['results']), 30); self.assertTrue(response['hasMore'])
        self.assertEqual(len(self.browser.get(self.root + 'staff/security-center/', {'category':'team','page':'2'}).json()['results']), 1)
        self.assertEqual(self.post(self.browser, 'staff/security-center', {}).status_code, 405)
        self.assertEqual(self.browser.get(self.root + 'staff/security-center/', {'account':'-1'}).status_code, 400)
