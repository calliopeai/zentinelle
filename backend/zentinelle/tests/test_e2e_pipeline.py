"""
End-to-end integration tests: full agent lifecycle pipeline.

Tests the complete flow an SDK client follows:
  register → config → evaluate → events → heartbeat → secrets

Uses Django's test client with a real database — no mocks.
"""
import hashlib
import hmac

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from unittest.mock import patch

from zentinelle.models import AgentEndpoint, Policy, Event


STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'
BOOTSTRAP_SECRET = 'e2e-test-bootstrap-secret'


def make_bootstrap_token(tenant_id: str) -> str:
    signature = hmac.new(
        BOOTSTRAP_SECRET.encode(),
        tenant_id.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f'bt_{tenant_id}_{signature}'


class AgentLifecycleE2ETest(TestCase):
    """Full agent lifecycle: register → config → evaluate → events → heartbeat → secrets."""

    @patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
    def test_full_agent_lifecycle(self):
        client = APIClient()
        bt = make_bootstrap_token(STANDALONE_TENANT)

        # ── 1. Register ──────────────────────────────────────────────────
        reg_resp = client.post(
            reverse('zentinelle:register'),
            data={
                'agent_type': AgentEndpoint.AgentType.CLAUDE_CODE,
                'name': 'E2E Test Agent',
                'capabilities': ['chat', 'tools', 'code'],
                'metadata': {'version': '1.0.0', 'test': True},
            },
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP=bt,
        )
        self.assertEqual(reg_resp.status_code, 201, reg_resp.json())
        reg = reg_resp.json()

        agent_id = reg['agent_id']
        api_key = reg['api_key']
        self.assertTrue(api_key.startswith('sk_agent_'))
        self.assertIn('config', reg)
        self.assertEqual(reg['config']['heartbeat_interval_seconds'], 60)

        endpoint = AgentEndpoint.objects.get(agent_id=agent_id)
        self.assertEqual(endpoint.tenant_id, STANDALONE_TENANT)
        self.assertEqual(endpoint.name, 'E2E Test Agent')
        self.assertEqual(endpoint.agent_type, AgentEndpoint.AgentType.CLAUDE_CODE)

        # Switch to runtime API key
        client.credentials(HTTP_X_ZENTINELLE_KEY=api_key)

        # ── 2. Get Config ────────────────────────────────────────────────
        config_resp = client.get(
            reverse('zentinelle:config', kwargs={'agent_id': agent_id}),
        )
        self.assertEqual(config_resp.status_code, 200)
        config = config_resp.json()
        self.assertEqual(config['agent_id'], agent_id)
        self.assertIn('config', config)
        self.assertIn('policies', config)

        # ── 3. Evaluate (no policies → allowed) ─────────────────────────
        eval_resp = client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': agent_id,
                'action': 'tool_call',
                'user_id': 'user-123',
                'context': {'tool': 'web_search', 'tool_input': {'query': 'test'}},
            },
            format='json',
        )
        self.assertEqual(eval_resp.status_code, 200)
        ev = eval_resp.json()
        self.assertTrue(ev['allowed'])
        self.assertEqual(ev['policies_evaluated'], [])

        # ── 4. Evaluate with blocking policy ─────────────────────────────
        Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Block shell',
            policy_type=Policy.PolicyType.TOOL_PERMISSION,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'denied_tools': ['shell', 'Bash']},
        )

        blocked_resp = client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': agent_id,
                'action': 'tool_call',
                'user_id': 'user-123',
                'context': {'tool': 'shell'},
            },
            format='json',
        )
        self.assertEqual(blocked_resp.status_code, 200)
        blocked = blocked_resp.json()
        self.assertFalse(blocked['allowed'])
        self.assertIn('denied', blocked['reason'].lower())

        # Non-denied tool should still pass
        allowed_resp = client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': agent_id,
                'action': 'tool_call',
                'user_id': 'user-123',
                'context': {'tool': 'web_search'},
            },
            format='json',
        )
        self.assertTrue(allowed_resp.json()['allowed'])

        # ── 5. Send Events ───────────────────────────────────────────────
        events_resp = client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': agent_id,
                'events': [
                    {
                        'type': 'tool_call',
                        'category': 'audit',
                        'timestamp': '2026-05-07T00:00:00Z',
                        'user_id': 'user-123',
                        'payload': {'tool': 'web_search', 'duration_ms': 450},
                    },
                    {
                        'type': 'model_request',
                        'category': 'telemetry',
                        'timestamp': '2026-05-07T00:00:01Z',
                        'payload': {'model': 'claude-3-5-sonnet', 'tokens': 1500},
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(events_resp.status_code, 202, events_resp.json())
        ev_data = events_resp.json()
        self.assertEqual(ev_data['accepted'], 2)

        events = Event.objects.filter(
            endpoint=endpoint,
            tenant_id=STANDALONE_TENANT,
        )
        self.assertGreaterEqual(events.count(), 2)

        # ── 6. Heartbeat ─────────────────────────────────────────────────
        hb_resp = client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': agent_id,
                'status': 'healthy',
                'metrics': {'requests_processed': 42, 'errors_last_5min': 0},
            },
            format='json',
        )
        self.assertEqual(hb_resp.status_code, 202)
        hb = hb_resp.json()
        self.assertTrue(hb['acknowledged'])
        self.assertIn('config_changed', hb)
        self.assertIn('next_heartbeat_seconds', hb)

        endpoint.refresh_from_db()
        self.assertIsNotNone(endpoint.last_heartbeat)
        self.assertEqual(endpoint.health, AgentEndpoint.Health.HEALTHY)

        # ── 7. Get Secrets ───────────────────────────────────────────────
        secrets_resp = client.get(
            reverse('zentinelle:secrets-agent', kwargs={'agent_id': agent_id}),
        )
        self.assertEqual(secrets_resp.status_code, 200)
        secrets = secrets_resp.json()
        self.assertIn('secrets', secrets)
        self.assertIn('expires_at', secrets)

        # ── 8. Deregister ────────────────────────────────────────────────
        dereg_resp = client.post(
            reverse('zentinelle:deregister'),
            data={'agent_id': agent_id},
            format='json',
        )
        self.assertEqual(dereg_resp.status_code, 200)

        endpoint.refresh_from_db()
        self.assertEqual(endpoint.status, AgentEndpoint.Status.INACTIVE)


class MultiAgentE2ETest(TestCase):
    """Test multiple agents registered to the same tenant."""

    @patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
    def test_two_agents_isolated(self):
        client = APIClient()
        bt = make_bootstrap_token(STANDALONE_TENANT)

        # Register agent A
        resp_a = client.post(
            reverse('zentinelle:register'),
            data={'agent_type': 'claude_code', 'name': 'Agent A'},
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP=bt,
        )
        key_a = resp_a.json()['api_key']
        id_a = resp_a.json()['agent_id']

        # Register agent B
        resp_b = client.post(
            reverse('zentinelle:register'),
            data={'agent_type': 'gemini', 'name': 'Agent B'},
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP=bt,
        )
        key_b = resp_b.json()['api_key']
        id_b = resp_b.json()['agent_id']

        # Agent A cannot access Agent B's config
        client.credentials(HTTP_X_ZENTINELLE_KEY=key_a)
        resp = client.get(
            reverse('zentinelle:config', kwargs={'agent_id': id_b}),
        )
        self.assertEqual(resp.status_code, 403)

        # Agent A can access its own config
        resp = client.get(
            reverse('zentinelle:config', kwargs={'agent_id': id_a}),
        )
        self.assertEqual(resp.status_code, 200)


class BootstrapTokenE2ETest(TestCase):
    """Test bootstrap token validation scenarios."""

    def test_missing_bootstrap_token_rejected(self):
        client = APIClient()
        resp = client.post(
            reverse('zentinelle:register'),
            data={'agent_type': 'custom', 'name': 'No Token'},
            format='json',
        )
        self.assertEqual(resp.status_code, 403)

    def test_invalid_bootstrap_signature_rejected(self):
        client = APIClient()
        resp = client.post(
            reverse('zentinelle:register'),
            data={'agent_type': 'custom', 'name': 'Bad Sig'},
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP='bt_fakeid_invalidsignature',
        )
        self.assertEqual(resp.status_code, 403)

    @patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
    def test_db_bootstrap_token_accepted(self):
        from zentinelle.models.bootstrap_token import BootstrapToken
        token_str, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='E2E test token',
        )

        client = APIClient()
        resp = client.post(
            reverse('zentinelle:register'),
            data={'agent_type': 'custom', 'name': 'DB Token Agent'},
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP=token_str,
        )
        self.assertEqual(resp.status_code, 201)

        record.refresh_from_db()
        self.assertEqual(record.use_count, 1)
        self.assertIsNotNone(record.last_used_at)


class AuthE2ETest(TestCase):
    """Test portal session auth endpoints."""

    def test_login_logout_me_flow(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.create_user(
            username='testadmin',
            password='testpass123',
            is_staff=True,
        )

        client = APIClient()

        # Login
        resp = client.post(
            reverse('zentinelle:auth-login'),
            data={'username': 'testadmin', 'password': 'testpass123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['user']['username'], 'testadmin')
        self.assertTrue(data['user']['is_staff'])
        self.assertIn('csrf_token', data)

        # Me
        me_resp = client.get(reverse('zentinelle:auth-me'))
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()['user']['username'], 'testadmin')

        # Logout
        logout_resp = client.post(reverse('zentinelle:auth-logout'))
        self.assertEqual(logout_resp.status_code, 200)

        # Me after logout — should fail
        me_resp2 = client.get(reverse('zentinelle:auth-me'))
        self.assertIn(me_resp2.status_code, [401, 403])

    def test_login_bad_credentials_rejected(self):
        client = APIClient()
        resp = client.post(
            reverse('zentinelle:auth-login'),
            data={'username': 'noexist', 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(resp.status_code, 401)


class HealthE2ETest(TestCase):
    """Test platform health endpoints."""

    def test_health_returns_ok(self):
        client = APIClient()
        resp = client.get(reverse('zentinelle:health'))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'ok')

    def test_ready_checks_db_and_cache(self):
        client = APIClient()
        resp = client.get(reverse('zentinelle:ready'))
        data = resp.json()
        self.assertIn('checks', data)
        self.assertIn('database', data['checks'])
