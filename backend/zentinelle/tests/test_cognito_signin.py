"""Runtime SSO and Cognito authorization regression tests."""
import json
import time
from unittest.mock import Mock, patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from zentinelle.auth.oidc import OIDCCallbackView
from zentinelle.auth.roles import ROLE_VIEWER, can_admin

API = '/api/zentinelle/v1/auth/'
CONFIG = {
    'discovery_url': 'https://issuer.example/.well-known/openid-configuration',
    'client_id': 'console', 'client_secret': 'private',
    'redirect_uri': 'https://console.example/api/zentinelle/v1/auth/oidc/callback',
    'tenant_claim': 'org_id', 'role_claim': 'role', 'expected_tenant': '',
    'groups_claim': 'cognito:groups',
    'group_role_mapping': json.dumps({'admins': 'admin', 'readers': 'viewer'}),
    'post_login_url': '/',
}


@override_settings(AUTH_MODE='sso')
class CognitoSignInTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.claims = {'iss': 'https://issuer.example', 'sub': 'one',
                       'email': 'admin@example.test', 'cognito:groups': ['admins']}

    def test_group_priority_and_demotion(self):
        view = OIDCCallbackView()
        self.claims['cognito:groups'] = ['readers', 'admins']
        user = view._provision_user(self.claims, CONFIG)
        self.assertTrue(can_admin(user))
        self.assertFalse(user.has_usable_password())
        self.claims['cognito:groups'] = ['readers']
        user = view._provision_user(self.claims, CONFIG)
        self.assertFalse(can_admin(user))
        self.assertFalse(user.is_staff)
        self.assertTrue(user.groups.filter(name=ROLE_VIEWER).exists())

    def test_unmapped_or_malformed_groups_cannot_use_scalar_admin(self):
        self.claims['role'] = 'admin'
        for groups in ([], ['outsiders'], 'admins', None, [123]):
            with self.subTest(groups=groups), self.assertRaises(ValueError):
                OIDCCallbackView()._provision_user(dict(self.claims, **{'cognito:groups': groups}), CONFIG)
        self.assertFalse(get_user_model().objects.exists())

    def test_invalid_mapping_fails_closed(self):
        for mapping in ('{bad', '[]', '{}', '{"admins":"superuser"}'):
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                OIDCCallbackView()._provision_user(self.claims, dict(CONFIG, group_role_mapping=mapping))

    def test_runtime_config_contains_no_provider_secrets(self):
        with patch('zentinelle.api.views.auth._get_config', return_value=CONFIG):
            response = self.client.get(API + 'config')
        self.assertEqual(response.json(), {'mode': 'sso', 'oidc_enabled': True})
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_sso_rejects_valid_local_password_but_local_mode_keeps_it(self):
        get_user_model().objects.create_user(username='legacy', password='legacy-test-password')
        credentials = {'username': 'legacy', 'password': 'legacy-test-password'}
        self.assertEqual(self.client.post(API + 'login', credentials).status_code, 403)
        with override_settings(AUTH_MODE='local'):
            self.assertEqual(self.client.post(API + 'login', credentials).status_code, 200)

    def test_signed_callback_creates_session_only_for_authorized_group(self):
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
        jwk['kid'] = 'test-key'
        discovery = {'issuer': self.claims['iss'], 'jwks_uri': 'https://issuer.example/jwks',
                     'token_endpoint': 'https://issuer.example/token'}
        for groups, expected in ((['admins'], 302), (['outsiders'], 403)):
            self.client.logout()
            session = self.client.session
            session.update({'oidc_state': 'state', 'oidc_nonce': 'nonce',
                            'oidc_verifier': 'verifier', 'oidc_started_at': time.time()})
            session.save()
            claims = dict(self.claims, aud='console', nonce='nonce', iat=int(time.time()),
                          exp=int(time.time()) + 60, **{'cognito:groups': groups})
            token = jwt.encode(claims, private, algorithm='RS256', headers={'kid': 'test-key'})
            with patch('zentinelle.auth.oidc._get_config', return_value=CONFIG), \
                    patch('zentinelle.auth.oidc._discover', return_value=discovery), \
                    patch('zentinelle.auth.oidc._get_jwks', return_value={'keys': [jwk]}), \
                    patch('zentinelle.auth.oidc.httpx.post', return_value=Mock(
                        status_code=200, json=lambda: {'id_token': token})):
                response = self.client.get(API + 'oidc/callback', {'code': 'code', 'state': 'state'})
            self.assertEqual(response.status_code, expected)
            self.assertEqual('_auth_user_id' in self.client.session, expected == 302)
