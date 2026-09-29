"""The gateway's provider-key lookup (#380).

The Go gateway holds no provider keys of its own: it reads the stored
LLMProviderKey of the tenant the agent key belongs to. The endpoint releases a
raw provider key, so it takes two credentials. The gateway's own registered
credential says which gateway is asking, and so which tenants it may act for.
The agent key says whose key is read. Neither is enough alone, and a key is
released only when the agent's tenant is one the gateway is registered for.
"""
import importlib
import io
import json
import os
import stat
import tempfile
from unittest import skipIf
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.auth import gateway_credential as local_credential
from zentinelle.auth.gateway_credential import (
    LOCAL_GATEWAY_NAME, STANDALONE_TENANT_ID, ensure_local_gateway_credential)
from zentinelle.models import (AgentEndpoint, AuditLog, GatewayCredential,
                               GatewayRegistration, LLMProviderKey)

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


def register(name, tenant_ids, cluster_id=''):
    registration = GatewayRegistration.objects.create(name=name, tenant_ids=tenant_ids, cluster_id=cluster_id)
    plaintext, _ = GatewayCredential.mint(registration)
    return registration, plaintext


def lookup(provider='openai', agent_key=None, credential=None, **headers):
    if agent_key is not None:
        headers['HTTP_X_ZENTINELLE_KEY'] = agent_key
    if credential is not None:
        headers['HTTP_X_ZENTINELLE_GATEWAY_CREDENTIAL'] = credential
    return APIClient().post(
        reverse('zentinelle:gateway-provider-key'), {'provider': provider}, format='json', **headers)


class GatewayProviderKeyTests(TestCase):
    def setUp(self):
        self.agent_a = make_agent(TENANT_A, 'agent-a')
        self.agent_b = make_agent(TENANT_B, 'agent-b')
        store_key(TENANT_A, 'openai', KEY_A)
        store_key(TENANT_B, 'openai', KEY_B)
        store_key(TENANT_B, 'anthropic', ANTHROPIC_KEY_B)
        # One gateway serving both tenants, and one serving only tenant A.
        self.shared, self.shared_credential = register('shared-cluster', [TENANT_A, TENANT_B], 'shared-1')
        self.only_a, self.only_a_credential = register('tenant-a-cluster', [TENANT_A])

    def lookup(self, provider='openai', agent_key=None, credential='shared', **headers):
        if credential == 'shared':
            credential = self.shared_credential
        return lookup(provider, agent_key, credential, **headers)

    # --- both credentials -------------------------------------------------

    def test_the_agents_tenant_key_is_released_to_its_gateway(self):
        response = self.lookup(agent_key=self.agent_a)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'provider': 'openai', 'api_key': KEY_A})
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_an_agent_key_alone_reads_nothing(self):
        # The agent is exactly who the provider key is kept from.
        response = self.lookup(agent_key=self.agent_a, credential=None)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())

    def test_a_gateway_credential_alone_reads_nothing(self):
        response = self.lookup(agent_key=None)

        self.assertEqual(response.status_code, 401)
        self.assertNotIn(KEY_A, response.content.decode())
        self.assertNotIn(KEY_B, response.content.decode())

    def test_a_credential_that_is_not_registered_is_refused(self):
        for credential in (self.shared_credential[:-1] + 'x', 'sk_gateway_' + 'x' * 43, 'not-a-gateway-credential'):
            with self.subTest(credential=credential[:14]):
                response = self.lookup(agent_key=self.agent_a, credential=credential)

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

    # --- scope and revocation ---------------------------------------------

    def test_a_gateway_reads_only_the_tenants_it_is_registered_for(self):
        # One leaked cluster must not unlock every tenant.
        allowed = self.lookup(agent_key=self.agent_a, credential=self.only_a_credential)
        refused = self.lookup(agent_key=self.agent_b, credential=self.only_a_credential)

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()['api_key'], KEY_A)
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.json()['error'], 'tenant_not_in_gateway_scope')
        self.assertNotIn(KEY_B, refused.content.decode())
        self.assertFalse(AuditLog.objects.filter(tenant_id=TENANT_B, resource_type='llm_provider_key').exists())

    def test_a_gateway_with_no_tenants_reads_nothing(self):
        _, credential = register('empty-cluster', [])

        response = self.lookup(agent_key=self.agent_a, credential=credential)

        self.assertEqual(response.status_code, 403)

    def test_a_revoked_credential_stops_working_and_only_that_one(self):
        rotated, _ = GatewayCredential.mint(self.shared)
        GatewayCredential.objects.get(
            key_prefix=self.shared_credential[:len('sk_gateway_') + 8]).revoke()

        self.assertEqual(self.lookup(agent_key=self.agent_a).status_code, 401)
        self.assertEqual(self.lookup(agent_key=self.agent_a, credential=rotated).status_code, 200)

    def test_a_revoked_gateway_is_refused_with_every_credential(self):
        rotated, _ = GatewayCredential.mint(self.shared)
        self.shared.revoke()

        for credential in (self.shared_credential, rotated):
            response = self.lookup(agent_key=self.agent_a, credential=credential)
            self.assertEqual(response.status_code, 401)
        # Another gateway is untouched.
        self.assertEqual(self.lookup(agent_key=self.agent_a, credential=self.only_a_credential).status_code, 200)

    def test_both_credentials_work_while_one_is_rotated_in(self):
        rotated, _ = GatewayCredential.mint(self.shared)

        self.assertEqual(self.lookup(agent_key=self.agent_a).status_code, 200)
        self.assertEqual(self.lookup(agent_key=self.agent_a, credential=rotated).status_code, 200)

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

    def test_a_release_is_audited_with_the_gateway_and_without_the_value(self):
        response = self.lookup(agent_key=self.agent_a)
        self.assertEqual(response.status_code, 200)

        entry = AuditLog.objects.get(resource_type='llm_provider_key')
        self.assertEqual(entry.tenant_id, TENANT_A)
        self.assertEqual(entry.action, AuditLog.Action.ACCESS)
        self.assertEqual(entry.resource_id, 'openai')
        self.assertEqual(entry.metadata['gateway'], 'shared-cluster')
        self.assertEqual(entry.metadata['gateway_id'], str(self.shared.id))
        self.assertEqual(entry.metadata['cluster_id'], 'shared-1')
        self.assertEqual(entry.metadata['agent_id'], 'agent-a')
        recorded = json.dumps([entry.resource_id, entry.resource_name, entry.api_key_prefix,
                               entry.user_agent, entry.changes, entry.metadata])
        self.assertNotIn(KEY_A, recorded)
        self.assertNotIn(self.shared_credential, recorded)

        self.assertIsNotNone(LLMProviderKey.objects.get(tenant_id=TENANT_A, provider='openai').last_used_at)
        credential = GatewayCredential.objects.get(key_prefix=self.shared_credential[:len('sk_gateway_') + 8])
        self.assertIsNotNone(credential.last_used_at)

    def test_nothing_is_audited_when_nothing_is_released(self):
        self.lookup('google', agent_key=self.agent_a)
        self.lookup(agent_key=self.agent_a, credential=None)
        self.lookup(agent_key=self.agent_b, credential=self.only_a_credential)

        self.assertFalse(AuditLog.objects.filter(resource_type='llm_provider_key').exists())

    def test_logs_never_carry_the_key_or_the_credential(self):
        with self.assertLogs('zentinelle', level='INFO') as captured:
            self.assertEqual(self.lookup(agent_key=self.agent_a).status_code, 200)
            self.lookup(agent_key=self.agent_b, credential=self.only_a_credential)

        logged = '\n'.join(captured.output)
        self.assertIn('shared-cluster', logged)
        self.assertIn('not registered for', logged)
        for secret in (KEY_A, KEY_B, self.shared_credential, self.only_a_credential):
            self.assertNotIn(secret, logged)


class GatewayCredentialModelTests(TestCase):
    def test_only_a_hash_of_the_credential_is_stored(self):
        registration = GatewayRegistration.objects.create(name='hashing', tenant_ids=[TENANT_A])

        plaintext, record = GatewayCredential.mint(registration)

        self.assertTrue(plaintext.startswith('sk_gateway_'))
        self.assertTrue(plaintext.startswith(record.key_prefix))
        self.assertNotIn(plaintext[len(record.key_prefix):], record.key_hash)
        self.assertEqual(GatewayCredential.authenticate(plaintext), record)
        self.assertIsNone(GatewayCredential.authenticate(plaintext + 'x'))

        record.revoke()
        self.assertIsNone(GatewayCredential.authenticate(plaintext))


class LocalGatewayCredentialTests(TestCase):
    """Zero-configuration compose: the backend registers the local gateway."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.dir = directory.name
        self.path = os.path.join(self.dir, 'gateway-credential')

    def ensure(self, path=None):
        with override_settings(ZENTINELLE_GATEWAY_CREDENTIAL_FILE=path or self.path):
            return ensure_local_gateway_credential()

    def read(self):
        with open(self.path, encoding='utf-8') as handle:
            return handle.read()

    def live_local_credentials(self):
        return GatewayCredential.objects.filter(registration__name=LOCAL_GATEWAY_NAME, revoked_at__isnull=True)

    def test_the_local_gateway_is_registered_for_the_standalone_tenant(self):
        with self.assertLogs('zentinelle.auth.gateway_credential', level='INFO') as captured:
            self.assertEqual(self.ensure(), self.path)

        credential = self.read()
        registration = GatewayRegistration.objects.get(name=LOCAL_GATEWAY_NAME)
        self.assertEqual(registration.tenant_ids, [STANDALONE_TENANT_ID])
        self.assertEqual(GatewayCredential.authenticate(credential).registration, registration)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(os.listdir(self.dir), ['gateway-credential'])
        logged = '\n'.join(captured.output)
        self.assertIn(self.path, logged)
        self.assertNotIn(credential, logged)

    def test_an_existing_credential_file_is_left_alone(self):
        with open(self.path, 'w', encoding='utf-8') as handle:
            handle.write('sk_gateway_provided-by-an-operator')

        self.assertEqual(self.ensure(), '')

        self.assertFalse(GatewayRegistration.objects.filter(name=LOCAL_GATEWAY_NAME).exists())
        self.assertEqual(self.read(), 'sk_gateway_provided-by-an-operator')

    def test_nothing_happens_where_no_volume_is_mounted(self):
        path = os.path.join(self.dir, 'not-mounted', 'gateway-credential')

        with self.assertLogs('zentinelle.auth.gateway_credential', level='INFO') as captured:
            self.assertEqual(self.ensure(path), '')

        self.assertIn('does not exist', '\n'.join(captured.output))
        self.assertFalse(GatewayRegistration.objects.exists())

    @skipIf(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root can write to a read-only directory')
    def test_an_unwritable_volume_leaves_no_live_credential_behind(self):
        os.chmod(self.dir, 0o500)
        self.addCleanup(os.chmod, self.dir, 0o700)

        with self.assertLogs('zentinelle.auth.gateway_credential', level='WARNING'):
            self.assertEqual(self.ensure(), '')

        self.assertFalse(self.live_local_credentials().exists())

    def test_a_replica_that_loses_the_race_revokes_what_it_minted(self):
        # Another replica links its credential into place first.
        winner = 'sk_gateway_the-other-replicas-credential'
        real_link = os.link

        def another_replica_links_first(source, destination):
            with open(destination, 'x', encoding='utf-8') as handle:
                handle.write(winner)
            return real_link(source, destination)

        with patch.object(local_credential.os, 'link', side_effect=another_replica_links_first):
            self.assertEqual(self.ensure(), '')

        self.assertEqual(self.read(), winner)
        self.assertFalse(self.live_local_credentials().exists())
        self.assertEqual(os.listdir(self.dir), ['gateway-credential'])

    def test_removing_the_file_rotates_the_credential(self):
        self.ensure()
        first = self.read()
        os.unlink(self.path)

        self.ensure()
        second = self.read()

        self.assertNotEqual(first, second)
        self.assertIsNone(GatewayCredential.authenticate(first))
        self.assertIsNotNone(GatewayCredential.authenticate(second))
        self.assertEqual(self.live_local_credentials().count(), 1)

    def test_a_revoked_local_gateway_is_not_brought_back(self):
        GatewayRegistration.objects.create(name=LOCAL_GATEWAY_NAME, tenant_ids=[STANDALONE_TENANT_ID]).revoke()

        with self.assertLogs('zentinelle.auth.gateway_credential', level='WARNING'):
            self.assertEqual(self.ensure(), '')

        self.assertFalse(os.path.exists(self.path))

    def test_the_web_process_writes_it_when_it_starts(self):
        # The gateway reads the file when it starts, so it has to exist before
        # the first lookup, not because of one.
        agent = make_agent(STANDALONE_TENANT_ID, 'standalone-agent')
        store_key(STANDALONE_TENANT_ID, 'openai', KEY_A)

        with override_settings(ZENTINELLE_GATEWAY_CREDENTIAL_FILE=self.path):
            importlib.reload(importlib.import_module('config.wsgi'))
        response = lookup(agent_key=agent, credential=self.read())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['api_key'], KEY_A)


class GatewayCredentialCommandTests(TestCase):
    def run_command(self, *args):
        out = io.StringIO()
        call_command('gateway_credential', *args, stdout=out)
        return out.getvalue()

    def test_register_prints_a_working_credential_once(self):
        output = self.run_command('register', 'prod-us-east-1', '--tenant', TENANT_A,
                                  '--tenant', TENANT_B, '--tenant', TENANT_A, '--cluster', 'prod-us-east-1')

        registration = GatewayRegistration.objects.get(name='prod-us-east-1')
        self.assertEqual(registration.tenant_ids, [TENANT_A, TENANT_B])
        self.assertEqual(registration.cluster_id, 'prod-us-east-1')
        credential = next(line.split()[-1] for line in output.splitlines() if line.startswith('Credential:'))
        self.assertEqual(GatewayCredential.authenticate(credential).registration, registration)

    def test_plain_output_is_the_credential_alone(self):
        output = self.run_command('register', 'piped', '--tenant', TENANT_A, '--plain')

        self.assertIsNotNone(GatewayCredential.authenticate(output.strip()))
        self.assertEqual(len(output.strip().splitlines()), 1)

    def test_list_never_shows_a_credential(self):
        credential = self.run_command('register', 'listed', '--tenant', TENANT_A, '--plain').strip()

        output = self.run_command('list')

        self.assertIn('listed', output)
        self.assertIn(credential[:len('sk_gateway_') + 8], output)
        self.assertNotIn(credential, output)

    def test_rotation_mints_a_second_credential_then_revokes_the_first(self):
        first = self.run_command('register', 'rotating', '--tenant', TENANT_A, '--plain').strip()
        second = self.run_command('mint', 'rotating', '--plain').strip()
        self.assertIsNotNone(GatewayCredential.authenticate(first))
        self.assertIsNotNone(GatewayCredential.authenticate(second))

        self.run_command('revoke', 'rotating', '--credential', first[:len('sk_gateway_') + 8])

        self.assertIsNone(GatewayCredential.authenticate(first))
        self.assertIsNotNone(GatewayCredential.authenticate(second))

    def test_scope_replaces_the_tenants_and_revoke_ends_the_gateway(self):
        credential = self.run_command('register', 'rescoped', '--tenant', TENANT_A, '--plain').strip()

        self.run_command('scope', 'rescoped', '--tenant', TENANT_B)
        self.assertEqual(GatewayRegistration.objects.get(name='rescoped').tenant_ids, [TENANT_B])

        self.run_command('revoke', 'rescoped')
        self.assertIsNone(GatewayCredential.authenticate(credential))

    def test_names_are_unique_and_local_belongs_to_the_backend(self):
        self.run_command('register', 'taken', '--tenant', TENANT_A)

        with self.assertRaises(CommandError):
            self.run_command('register', 'taken', '--tenant', TENANT_A)
        with self.assertRaises(CommandError):
            self.run_command('register', LOCAL_GATEWAY_NAME, '--tenant', TENANT_A)
