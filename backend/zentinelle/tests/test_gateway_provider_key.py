"""The gateway's provider-key lookup (#380).

The Go gateway no longer holds provider keys of its own: it reads the stored
LLMProviderKey of the tenant the agent key belongs to. The endpoint releases a
raw provider key, so it takes two credentials. The gateway token says who may
read keys, and the agent key says whose key is read. Neither is enough alone.
"""
import json

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.models import AgentEndpoint, AuditLog, LLMProviderKey

GATEWAY_TOKEN = 'gateway-test-token-0123456789abcdef0123456789'
TENANT_A = 'tenant-a'
TENANT_B = 'tenant-b'
KEY_A = 'sk-tenant-a-openai-key'
KEY_B = 'sk-tenant-b-openai-key'
ANTHROPIC_KEY_B = 'sk-ant-tenant-b-key'


def make_agent(tenant_id, agent_id, status=AgentEndpoint.Status.ACTIVE):
    key, key_hash, prefix = AgentEndpoint.generate_api_key()
    AgentEndpoint.objects.create(
        tenant_id=tenant_id, agent_id=agent_id, name=agent_id, status=status,
        api_key_hash=key_hash, api_key_prefix=prefix,
    )
    return key


def store_key(tenant_id, provider, plaintext):
    record = LLMProviderKey(tenant_id=tenant_id, provider=provider)
    record.set_key(plaintext)
    record.save()
    return record


@override_settings(ZENTINELLE_GATEWAY_TOKEN=GATEWAY_TOKEN)
class GatewayProviderKeyTests(TestCase):
    def setUp(self):
        self.agent_a = make_agent(TENANT_A, 'agent-a')
        self.agent_b = make_agent(TENANT_B, 'agent-b')
        store_key(TENANT_A, 'openai', KEY_A)
        store_key(TENANT_B, 'openai', KEY_B)
        store_key(TENANT_B, 'anthropic', ANTHROPIC_KEY_B)

    def lookup(self, provider='openai', agent_key=None, token=GATEWAY_TOKEN, **headers):
        if agent_key is not None:
            headers['HTTP_X_ZENTINELLE_KEY'] = agent_key
        if token is not None:
            headers['HTTP_X_ZENTINELLE_GATEWAY_TOKEN'] = token
        return APIClient().post(
            reverse('zentinelle:gateway-provider-key'), {'provider': provider},
            format='json', **headers,
        )

    # --- both credentials -------------------------------------------------

    def test_the_agents_tenant_key_is_released_to_the_gateway(self):
        response = self.lookup(agent_key=self.agent_a)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'provider': 'openai', 'api_key': KEY_A})
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_an_agent_key_alone_reads_nothing(self):
        # The agent is exactly who the provider key is kept from.
        response = self.lookup(agent_key=self.agent_a, token=None)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())

    def test_the_gateway_token_alone_reads_nothing(self):
        response = self.lookup(agent_key=None)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())
        self.assertNotIn(KEY_B, response.content.decode())

    def test_a_wrong_gateway_token_is_refused(self):
        response = self.lookup(agent_key=self.agent_a, token=GATEWAY_TOKEN[:-1] + 'x')

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())

    def test_an_invalid_agent_key_is_refused(self):
        response = self.lookup(agent_key='sk_agent_notarealkey000000000000')

        self.assertEqual(response.status_code, 401)

    def test_a_suspended_agent_reads_nothing(self):
        suspended = make_agent(TENANT_A, 'agent-suspended', AgentEndpoint.Status.SUSPENDED)

        response = self.lookup(agent_key=suspended)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())

    @override_settings(ZENTINELLE_GATEWAY_TOKEN='')
    def test_the_lookup_is_off_until_a_token_is_configured(self):
        # An empty presented token must not match an empty configured one.
        for token in ('', GATEWAY_TOKEN):
            with self.subTest(token=token):
                response = self.lookup(agent_key=self.agent_a, token=token)

                self.assertEqual(response.status_code, 403)
                self.assertNotIn(KEY_A, response.content.decode())

    @override_settings(ZENTINELLE_GATEWAY_TOKEN='too-short')
    def test_a_guessable_configured_token_is_refused(self):
        with self.assertLogs('zentinelle', level='ERROR'):
            response = self.lookup(agent_key=self.agent_a, token='too-short')

        self.assertEqual(response.status_code, 403)
        self.assertNotIn(KEY_A, response.content.decode())

    # --- tenant isolation -------------------------------------------------

    def test_each_tenant_gets_its_own_key(self):
        response_a = self.lookup(agent_key=self.agent_a)
        response_b = self.lookup(agent_key=self.agent_b)

        self.assertEqual(response_a.json()['api_key'], KEY_A)
        self.assertEqual(response_b.json()['api_key'], KEY_B)

    def test_another_tenants_key_is_never_a_substitute(self):
        # Tenant B stores an Anthropic key and tenant A does not. A's agent is
        # told there is none, not handed B's.
        response = self.lookup('anthropic', agent_key=self.agent_a)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'provider_key_not_found')
        self.assertNotIn(ANTHROPIC_KEY_B, response.content.decode())

    # --- nothing to release ----------------------------------------------

    def test_no_stored_key_is_a_404(self):
        response = self.lookup('google', agent_key=self.agent_a)

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['error'], 'provider_key_not_found')
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_a_revoked_key_is_a_404(self):
        LLMProviderKey.objects.filter(tenant_id=TENANT_A, provider='openai').update(is_active=False)

        response = self.lookup(agent_key=self.agent_a)

        self.assertEqual(response.status_code, 404)
        self.assertNotIn(KEY_A, response.content.decode())

    def test_a_placeholder_row_without_a_key_is_a_404(self):
        # The settings page stores a keyless row to remember a local
        # provider's toggle.
        LLMProviderKey.objects.create(tenant_id=TENANT_A, provider='ollama', encrypted_key=b'')

        response = self.lookup('ollama', agent_key=self.agent_a)

        self.assertEqual(response.status_code, 404)

    def test_a_key_that_cannot_be_decrypted_is_not_reported_missing(self):
        # A 404 lets the gateway fall back to its own env key. A key that
        # exists but cannot be read must not send this tenant there.
        LLMProviderKey.objects.filter(tenant_id=TENANT_A, provider='openai').update(
            encrypted_key=b'not-a-fernet-token')

        with self.assertLogs('zentinelle', level='ERROR'):
            response = self.lookup(agent_key=self.agent_a)

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()['error'], 'provider_key_unreadable')
        self.assertFalse(AuditLog.objects.filter(resource_type='llm_provider_key').exists())

    def test_an_unknown_provider_spelling_is_rejected(self):
        for provider in ('', 'OpenAI', '../openai', 'x' * 51):
            with self.subTest(provider=provider):
                response = self.lookup(provider, agent_key=self.agent_a)

                self.assertEqual(response.status_code, 400)

    # --- storage, audit, logs ---------------------------------------------

    def test_the_key_round_trips_through_encryption_at_rest(self):
        plaintext = 'sk-round-trip-' + 'z' * 40
        record = store_key(TENANT_A, 'mistral', plaintext)
        record.refresh_from_db()

        self.assertNotIn(plaintext.encode(), bytes(record.encrypted_key))
        response = self.lookup('mistral', agent_key=self.agent_a)
        self.assertEqual(response.json()['api_key'], plaintext)

    def test_a_release_is_audited_without_the_value(self):
        response = self.lookup(agent_key=self.agent_a, HTTP_X_ZENTINELLE_CLUSTER='prod-us-east-1')
        self.assertEqual(response.status_code, 200)

        entry = AuditLog.objects.get(resource_type='llm_provider_key')
        self.assertEqual(entry.tenant_id, TENANT_A)
        self.assertEqual(entry.action, AuditLog.Action.ACCESS)
        self.assertEqual(entry.resource_id, 'openai')
        self.assertEqual(entry.metadata['agent_id'], 'agent-a')
        self.assertEqual(entry.metadata['cluster_id'], 'prod-us-east-1')
        recorded = json.dumps([entry.resource_id, entry.resource_name, entry.api_key_prefix,
                               entry.user_agent, entry.changes, entry.metadata])
        self.assertNotIn(KEY_A, recorded)
        self.assertNotIn(GATEWAY_TOKEN, recorded)

        record = LLMProviderKey.objects.get(tenant_id=TENANT_A, provider='openai')
        self.assertIsNotNone(record.last_used_at)

    def test_nothing_is_audited_when_nothing_is_released(self):
        self.lookup('google', agent_key=self.agent_a)
        self.lookup(agent_key=self.agent_a, token=None)

        self.assertFalse(AuditLog.objects.filter(resource_type='llm_provider_key').exists())

    def test_logs_never_carry_the_key_or_the_token(self):
        with self.assertLogs('zentinelle', level='INFO') as captured:
            response = self.lookup(agent_key=self.agent_a)
        self.assertEqual(response.status_code, 200)

        logged = '\n'.join(captured.output)
        self.assertIn('openai', logged)
        self.assertNotIn(KEY_A, logged)
        self.assertNotIn(GATEWAY_TOKEN, logged)
