"""The portal login is the only password login, and its throttles key on the real client (T9)."""
import importlib
import json

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client, TestCase, override_settings
from django.urls import clear_url_caches

LOGIN = '/api/zentinelle/v1/auth/login'


def _reload_urls():
    clear_url_caches()
    importlib.reload(importlib.import_module('config.urls'))


class DjangoAdminTests(TestCase):
    def tearDown(self):
        _reload_urls()

    def test_admin_is_not_mounted_by_default(self):
        _reload_urls()
        self.assertEqual(Client().get('/admin/login/').status_code, 404)

    @override_settings(ENABLE_DJANGO_ADMIN=True)
    def test_an_operator_can_turn_it_on(self):
        _reload_urls()
        self.assertEqual(Client().get('/admin/login/').status_code, 200)


@override_settings(REST_FRAMEWORK={'NUM_PROXIES': 1})
class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        User.objects.create_user('victim', password='right-password')

    def login(self, client_ip, username='victim', password='wrong', remote='10.0.0.1'):
        # One trusted proxy (the load balancer at 10.0.0.1) appends the client.
        return Client(REMOTE_ADDR=remote).post(
            LOGIN, data=json.dumps({'username': username, 'password': password}),
            content_type='application/json', HTTP_X_FORWARDED_FOR=f'{client_ip}')

    def test_one_client_cannot_use_up_everyone_elses_attempts(self):
        for n in range(20):
            self.assertEqual(self.login('203.0.113.7', username=f'user{n}').status_code, 401)
        self.assertEqual(self.login('203.0.113.7', username='another').status_code, 429)

        self.assertEqual(self.login('198.51.100.9', username='another').status_code, 401,
                         'every client behind the load balancer shared one login limit')

    def test_bad_passwords_from_one_client_do_not_lock_the_user_out(self):
        for _ in range(20):
            self.login('203.0.113.7')
        self.assertEqual(self.login('203.0.113.7').status_code, 429)

        self.assertEqual(self.login('198.51.100.9', password='right-password').status_code, 200,
                         'a stranger locked the user out')

    def test_a_forged_forwarded_for_does_not_reset_the_limit(self):
        for n in range(20):
            self.login('evil, 203.0.113.7', username=f'user{n}')

        self.assertEqual(self.login('forged-1, 203.0.113.7', username='x').status_code, 429)


class NoTrustedProxyTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_without_a_trusted_proxy_the_header_is_ignored(self):
        for n in range(20):
            Client(REMOTE_ADDR='203.0.113.7').post(
                LOGIN, data=json.dumps({'username': f'u{n}', 'password': 'x'}), content_type='application/json',
                HTTP_X_FORWARDED_FOR=f'10.9.9.{n}')

        response = Client(REMOTE_ADDR='203.0.113.7').post(
            LOGIN, data=json.dumps({'username': 'u', 'password': 'x'}), content_type='application/json',
            HTTP_X_FORWARDED_FOR='10.9.9.99')
        self.assertEqual(response.status_code, 429, 'a caller-chosen X-Forwarded-For reset the limit')
