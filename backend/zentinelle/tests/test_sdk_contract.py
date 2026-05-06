"""
Tests for the agent-facing REST contract consumed by the SDK.
"""
import hashlib
import hmac
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.models import AgentEndpoint


STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'
BOOTSTRAP_SECRET = 'test-bootstrap-secret'


def make_bootstrap_token(tenant_id: str) -> str:
    signature = hmac.new(
        BOOTSTRAP_SECRET.encode(),
        tenant_id.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f'bt_{tenant_id}_{signature}'


class RegisterContractTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch.dict('os.environ', {'ZENTINELLE_BOOTSTRAP_SECRET': BOOTSTRAP_SECRET}, clear=False)
    def test_register_accepts_name_and_returns_runtime_contract(self):
        response = self.client.post(
            reverse('zentinelle:register'),
            data={
                'agent_type': AgentEndpoint.AgentType.CUSTOM,
                'name': 'SDK Contract Agent',
                'capabilities': ['chat'],
                'metadata': {'version': '1.0.0'},
            },
            format='json',
            HTTP_X_ZENTINELLE_BOOTSTRAP=make_bootstrap_token(STANDALONE_TENANT),
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['config']['heartbeat_interval_seconds'], 60)
        self.assertEqual(data['policies'], [])
        self.assertTrue(data['agent_id'])
        self.assertTrue(data['api_key'].startswith('sk_agent_'))

        endpoint = AgentEndpoint.objects.get(agent_id=data['agent_id'])
        self.assertEqual(endpoint.tenant_id, STANDALONE_TENANT)
        self.assertEqual(endpoint.name, 'SDK Contract Agent')


class SecretsContractTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='sdk-agent-001',
            name='SDK Agent',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            config={'version': '1.0'},
        )
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)

    def test_secrets_without_agent_id_returns_empty_payload(self):
        response = self.client.get(reverse('zentinelle:secrets'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['secrets'], {})
        self.assertEqual(data['providers'], {})
        self.assertIn('expires_at', data)

    def test_secrets_with_matching_agent_id_returns_empty_payload(self):
        response = self.client.get(
            reverse('zentinelle:secrets-agent', kwargs={'agent_id': self.endpoint.agent_id})
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['secrets'], {})

    def test_secrets_agent_mismatch_is_forbidden(self):
        response = self.client.get(
            reverse('zentinelle:secrets-agent', kwargs={'agent_id': 'other-agent'})
        )

        self.assertEqual(response.status_code, 403)
