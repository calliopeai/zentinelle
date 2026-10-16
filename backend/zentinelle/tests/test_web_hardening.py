"""No IDE outside debugging, a CSP on every response, and an idle session timeout (T14)."""
import importlib
import time

from django.contrib.auth.models import User
from django.test import Client, TestCase, override_settings
from django.urls import clear_url_caches

from zentinelle.api.middleware import SessionIdleTimeoutMiddleware

ME = '/api/zentinelle/v1/auth/me'


def _reload_urls():
    clear_url_caches()
    importlib.reload(importlib.import_module('config.urls'))


class GraphiQLTests(TestCase):
    def tearDown(self):
        _reload_urls()

    def ide(self):
        return Client().get('/gql/zentinelle/', HTTP_ACCEPT='text/html')

    def test_production_serves_no_ide(self):
        with override_settings(DEBUG=False):
            _reload_urls()
            response = self.ide()
        self.assertNotIn(b'graphiql', response.content.lower())

    def test_debugging_still_has_it(self):
        with override_settings(DEBUG=True):
            _reload_urls()
            response = self.ide()
        self.assertIn(b'graphiql', response.content.lower())


class ContentSecurityPolicyTests(TestCase):
    def test_every_response_carries_a_csp(self):
        response = Client().get('/api/zentinelle/v1/health')

        policy = response.headers.get('Content-Security-Policy', '')
        for directive in ("default-src 'self'", "frame-ancestors 'none'", "object-src 'none'"):
            self.assertIn(directive, policy)


@override_settings(SESSION_IDLE_TIMEOUT_SECONDS=600)
class IdleTimeoutTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.client.force_login(User.objects.create_user('idle', password='pw'))

    def set_last_activity(self, seconds_ago):
        session = self.client.session
        session[SessionIdleTimeoutMiddleware.STAMP] = int(time.time()) - seconds_ago
        session.save()

    def test_an_idle_session_is_signed_out(self):
        self.assertEqual(self.client.get(ME).status_code, 200)
        self.set_last_activity(601)

        self.assertIn(self.client.get(ME).status_code, (401, 403))
        self.assertIn(self.client.get(ME).status_code, (401, 403), 'the session came back')

    def test_an_active_session_stays(self):
        self.client.get(ME)
        self.set_last_activity(599)

        self.assertEqual(self.client.get(ME).status_code, 200)
