"""Exercise cryptographic, evidence and tenant boundaries with real model state."""
import json
import time
from unittest.mock import Mock, patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from zentinelle.auth.oidc import OIDCCallbackView
from zentinelle.auth.roles import ROLE_OPERATOR, ROLE_VIEWER, assign_role
from zentinelle.models import (AgentEndpoint, AuditLog, ComplianceAlert,
                               ContentScan)
from zentinelle.services.audit_chain import (stream_evidence_bundle,
                                             verify_evidence_bundle)
from zentinelle.tests.test_dependable_controls import API, TENANT


@override_settings(AUTH_MODE='local', CLICKHOUSE_URL='')
class ReviewContractTests(TestCase):
    def setUp(self):
        self.key, hashed, prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='contract',
                                                     name='Contract', api_key_hash=hashed, api_key_prefix=prefix)
        self.other = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='other', name='Other')
        self.user = get_user_model().objects.create_user('contract-human')
        self.client = APIClient()

    def test_agent_evidence_scope_and_human_alert_authority(self):
        scan = ContentScan.objects.create(tenant_id=TENANT, endpoint=self.other,
                                          content_type='user_input', content_length=0, content_hash='test')
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
        self.assertEqual(self.client.get(API + f'scan/{scan.pk}').status_code, 404)
        alert = ComplianceAlert.objects.create(tenant_id=TENANT, endpoint=self.endpoint,
                                               alert_type='single_violation', severity='high', title='Review')
        url = API + f'alerts/{alert.pk}/acknowledge'
        self.assertIn(self.client.post(url, {}, format='json').status_code, (401, 403))
        self.client.credentials()
        self.client.force_login(self.user)
        assign_role(self.user, ROLE_VIEWER)
        self.assertEqual(self.client.get(API + f'scan/{scan.pk}').status_code, 200)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 403)
        assign_role(self.user, ROLE_OPERATOR)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 200)
        alert.refresh_from_db()
        self.assertEqual(alert.acknowledged_by, str(self.user.pk))

    def test_downloaded_evidence_requires_complete_signed_manifest(self):
        AuditLog.objects.create(tenant_id=TENANT, action='review.one')
        AuditLog.objects.create(tenant_id=TENANT, action='review.two')
        records = AuditLog.objects.filter(tenant_id=TENANT).order_by('chain_sequence')
        bundle = list(stream_evidence_bundle(records, TENANT, {'kind': 'test'}))
        self.assertTrue(verify_evidence_bundle(bundle, TENANT)['valid'])
        for damaged in (bundle[:-1], bundle[1:], list(reversed(bundle)), bundle + bundle[:1]):
            self.assertFalse(verify_evidence_bundle(damaged, TENANT)['valid'])
        self.assertFalse(verify_evidence_bundle(bundle, 'another-tenant')['valid'])

    def test_assistant_confirmation_is_actor_argument_bound_and_single_use(self):
        from zentinelle.services.approvals import issue_approval
        from zentinelle.services.llm_tools import MUTATION_TOOLS, TOOL_DISPATCH
        name = next(n for n in MUTATION_TOOLS if n in TOOL_DISPATCH)
        args = {'name': 'Confirmed only'}
        token = issue_approval(tenant_id=TENANT, kind='assistant', subject=self.user.pk,
                               action=name, context=args, granted_by=self.user.pk)
        assign_role(self.user, ROLE_OPERATOR)
        self.client.force_login(self.user)
        payload = {'name': name, 'args': args, 'approval_token': token}
        with patch('zentinelle.services.llm_tools.execute_tool', return_value='{"success":true}') as execute:
            wrong = dict(payload, args={'name': 'Changed'})
            self.assertEqual(self.client.post(API + 'assistant/execute-tool', wrong, format='json').status_code, 403)
            self.assertEqual(self.client.post(API + 'assistant/execute-tool', payload, format='json').status_code, 200)
            self.assertEqual(self.client.post(API + 'assistant/execute-tool', payload, format='json').status_code, 403)
            execute.assert_called_once()

    def test_oidc_signed_claims_and_unknown_key_rotation(self):
        private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
        jwk['kid'] = 'rotated'
        config = {'client_id': 'console'}
        discovery = {'jwks_uri': 'https://issuer.invalid/jwks', 'issuer': 'https://issuer.invalid'}
        claims = {'iss': discovery['issuer'], 'sub': 'person', 'aud': 'console',
                  'iat': int(time.time()), 'exp': int(time.time()) + 60, 'nonce': 'nonce'}
        view = OIDCCallbackView()
        token = jwt.encode(claims, private, algorithm='RS256', headers={'kid': 'rotated'})
        with patch('zentinelle.auth.oidc._get_jwks', side_effect=[{'keys': []}, {'keys': [jwk]}]) as keys:
            self.assertEqual(view._validate_id_token(token, config, discovery)['sub'], 'person')
            self.assertTrue(keys.call_args.kwargs['refresh'])
        with patch('zentinelle.auth.oidc._get_jwks', return_value={'keys': [jwk]}):
            bad_claims = [dict(claims, aud=['console', 'another']), dict(claims, iss='https://other.invalid')]
            for required in ('sub', 'aud', 'exp', 'iat', 'nonce'):
                bad = dict(claims)
                bad.pop(required)
                bad_claims.append(bad)
            for bad in bad_claims:
                token = jwt.encode(bad, private, algorithm='RS256', headers={'kid': 'rotated'})
                with self.assertRaises((ValueError, jwt.PyJWTError)):
                    view._validate_id_token(token, config, discovery)

    def test_redacted_capture_removes_entire_private_key(self):
        from zentinelle.services.content_capture import redact_text
        self.assertNotIn('sensitivebase64', redact_text(
            'before -----BEGIN RSA PRIVATE KEY-----\nsensitivebase64\n-----END RSA PRIVATE KEY----- after'))

    def test_django_proxy_checks_real_policy_before_releasing_tool_stream(self):
        from unittest.mock import MagicMock

        from django.test import RequestFactory

        from zentinelle.models import Policy
        from zentinelle.proxy.views import ProxyView
        Policy.objects.create(tenant_id=TENANT, name='Output PII', policy_type='output_filter',
                              enforcement='enforce', config={'block_pii': True})
        stream = (b'data: {"choices":[{"delta":{"content":"safe visible text"}}]}\n\n'
                  b'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"private@"}}]}}]}\n\n'
                  b'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"example.com"}}]}}]}\n\n')
        upstream = MagicMock()
        upstream.status_code = 200
        upstream.headers = {'content-type': 'text/event-stream'}
        upstream.iter_bytes.return_value = [stream]
        request = RequestFactory().post('/proxy/openai/chat/completions',
                                        data=json.dumps({'model': 'gpt-4o', 'messages': [{'role': 'user', 'content': 'hello'}], 'stream': True}),
                                        content_type='application/json', HTTP_X_ZENTINELLE_KEY=self.key)
        with patch('httpx.Client') as client:
            client.return_value.__enter__.return_value.stream.return_value.__enter__.return_value = upstream
            response = ProxyView.as_view()(request, provider='openai', path='chat/completions')
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(b'private@', response.content)

    @override_settings(CONTENT_CAPTURE_MODE='full')
    def test_replay_uses_nested_tool_action_and_marks_missing_content_inconclusive(self):
        from django.utils import timezone

        from zentinelle.models import Event
        from zentinelle.services.policy_simulator import simulate_policy
        Event.objects.create(tenant_id=TENANT, endpoint=self.endpoint, event_type='policy_evaluation_tool_call',
                             occurred_at=timezone.now(), payload={'action': 'tool_call', 'context': {'tool_name': 'shell'}})
        result = simulate_policy(TENANT, {'policy_type': 'tool_permission', 'config': {'denied_tools': ['shell']}})
        self.assertEqual(result['would_block'], 1)
        result = simulate_policy(TENANT, {'policy_type': 'prompt_injection', 'config': {}})
        self.assertEqual(result['would_pass'], 0)
        self.assertEqual(result['inconclusive'], 1)

    def test_analytics_cleanup_disables_ttl_and_preserves_held_tenant(self):
        from zentinelle.models.retention_policy import LegalHold
        from zentinelle.services.clickhouse_service import (
            RETENTION_TABLES, disable_automatic_retention)
        from zentinelle.services.retention import enforce_retention
        client = Mock()
        client.query.return_value.result_rows = [['CREATE TABLE fixture ENGINE = MergeTree TTL occurred_at + INTERVAL 90 DAY']]
        with patch('zentinelle.services.clickhouse_service._get_clickhouse_url', return_value='fixture'), \
                patch('zentinelle.services.clickhouse_service._get_client', return_value=client):
            self.assertIs(disable_automatic_retention(), client)
        self.assertEqual(client.command.call_count, len(RETENTION_TABLES))
        self.assertTrue(all('REMOVE TTL' in c.args[0] for c in client.command.call_args_list))
        LegalHold.objects.create(tenant_id=TENANT, name='Hold')
        with patch('zentinelle.services.clickhouse_service.disable_automatic_retention', return_value=client), \
                patch('zentinelle.services.clickhouse_service.retention_tenants', return_value={TENANT}), \
                patch('zentinelle.services.clickhouse_service.retain_analytics') as delete:
            result = enforce_retention()
        self.assertEqual(result['tenants_held'], 1)
        delete.assert_not_called()

    def test_graphql_both_url_forms_preserve_posts_and_require_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        assign_role(self.user, ROLE_OPERATOR)
        client.force_login(self.user)
        payload = {'query': '{ __typename }'}
        for path in ('/gql/zentinelle', '/gql/zentinelle/'):
            self.assertEqual(client.post(path, payload, format='json').status_code, 403)
            token = client.get(API + 'auth/csrf').json()['csrf_token']
            response = client.post(path, payload, format='json', HTTP_X_CSRFTOKEN=token)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['data']['__typename'], 'Query')
