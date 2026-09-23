"""The gateway's provider-key lookup (#380).

The Go gateway no longer holds provider keys of its own: it reads the stored
LLMProviderKey of the tenant the agent key belongs to. The endpoint releases a
raw provider key, so it takes two credentials. The gateway token says who may
read keys, and the agent key says whose key is read. Neither is enough alone.
"""
import importlib
import json
import os
import stat
import subprocess
import tempfile
import threading
from pathlib import Path
from unittest import skipIf
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.auth import gateway_token as gateway_token_module
from zentinelle.auth.gateway_token import gateway_token
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


def write_token(path, token):
    with open(path, 'w', encoding='utf-8') as handle:
        handle.write(token)


@override_settings(ZENTINELLE_GATEWAY_TOKEN=GATEWAY_TOKEN)
class GatewayProviderKeyTests(TestCase):
    def setUp(self):
        # Each test starts with nothing reported, so its own reason is logged.
        gateway_token_module._last_reported = None
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

    @override_settings(ZENTINELLE_GATEWAY_TOKEN='', ZENTINELLE_GATEWAY_TOKEN_FILE='')
    def test_the_lookup_is_off_until_a_token_is_configured(self):
        # An empty presented token must not match an empty configured one.
        for token in ('', GATEWAY_TOKEN):
            with self.subTest(token=token):
                response = self.lookup(agent_key=self.agent_a, token=token)

                self.assertEqual(response.status_code, 403)
                self.assertNotIn(KEY_A, response.content.decode())

    def test_a_token_file_is_read_on_every_lookup(self):
        # So a rotated token takes effect without restarting the backend.
        first, second = 'first-gateway-token-' + 'a' * 40, 'second-gateway-token-' + 'b' * 40
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'gateway-token')
            write_token(path, first + '\n')
            with override_settings(ZENTINELLE_GATEWAY_TOKEN='', ZENTINELLE_GATEWAY_TOKEN_FILE=path):
                self.assertEqual(self.lookup(agent_key=self.agent_a, token=first).status_code, 200)

                write_token(path, second)
                self.assertEqual(self.lookup(agent_key=self.agent_a, token=first).status_code, 401)
                response = self.lookup(agent_key=self.agent_a, token=second)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['api_key'], KEY_A)

    def test_the_web_process_mints_a_token_when_it_starts(self):
        # The gateway reads the token file when it starts, so it has to exist
        # before the first lookup, not because of one.
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, 'gateway-token')
            with override_settings(ZENTINELLE_GATEWAY_TOKEN='', ZENTINELLE_GATEWAY_TOKEN_FILE=path):
                importlib.reload(importlib.import_module('config.wsgi'))
                with open(path, encoding='utf-8') as handle:
                    minted = handle.read()
                response = self.lookup(agent_key=self.agent_a, token=minted)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['api_key'], KEY_A)

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


class GatewayTokenResolutionTests(SimpleTestCase):
    """Where the backend gets the token it expects: env, else a file it may mint."""

    def setUp(self):
        gateway_token_module._last_reported = None
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.dir = directory.name
        self.path = os.path.join(self.dir, 'gateway-token')

    def resolve(self, **overrides):
        values = {'ZENTINELLE_GATEWAY_TOKEN': '', 'ZENTINELLE_GATEWAY_TOKEN_FILE': self.path, **overrides}
        with override_settings(**values):
            return gateway_token()

    def read(self):
        with open(self.path, encoding='utf-8') as handle:
            return handle.read()

    def test_a_missing_token_is_minted_privately_and_logged_without_its_value(self):
        with self.assertLogs('zentinelle.auth.gateway_token', level='INFO') as captured:
            token = self.resolve()

        self.assertRegex(token, r'^[0-9a-f]{64}$')
        self.assertEqual(self.read(), token)
        self.assertEqual(stat.S_IMODE(os.stat(self.path).st_mode), 0o600)
        self.assertEqual(os.listdir(self.dir), ['gateway-token'])
        logged = '\n'.join(captured.output)
        self.assertIn('Minted', logged)
        self.assertIn(self.path, logged)
        self.assertNotIn(token, logged)

    def test_an_existing_token_file_is_reused_and_never_rewritten(self):
        existing = 'operator-provided-token-' + 'x' * 40
        write_token(self.path, existing + '\n')
        before = os.stat(self.path)

        self.assertEqual(self.resolve(), existing)
        self.assertEqual(self.resolve(), existing)

        after = os.stat(self.path)
        self.assertEqual((after.st_ino, after.st_mtime_ns), (before.st_ino, before.st_mtime_ns))
        self.assertEqual(self.read(), existing + '\n')

    def test_the_environment_wins_and_nothing_is_minted(self):
        explicit = 'explicit-gateway-token-' + 'e' * 40

        self.assertEqual(self.resolve(ZENTINELLE_GATEWAY_TOKEN=explicit), explicit)
        self.assertFalse(os.path.exists(self.path))

        write_token(self.path, 'file-gateway-token-' + 'f' * 40)
        self.assertEqual(self.resolve(ZENTINELLE_GATEWAY_TOKEN=explicit), explicit)

    def test_a_missing_directory_disables_the_lookup_and_says_why(self):
        path = os.path.join(self.dir, 'not-mounted', 'gateway-token')

        with self.assertLogs('zentinelle.auth.gateway_token', level='WARNING') as captured:
            self.assertEqual(self.resolve(ZENTINELLE_GATEWAY_TOKEN_FILE=path), '')

        self.assertIn('does not exist', '\n'.join(captured.output))
        self.assertFalse(os.path.exists(os.path.dirname(path)))

    @skipIf(hasattr(os, 'geteuid') and os.geteuid() == 0, 'root can write to a read-only directory')
    def test_an_unwritable_directory_disables_the_lookup_and_says_why(self):
        os.chmod(self.dir, 0o500)
        self.addCleanup(os.chmod, self.dir, 0o700)

        with self.assertLogs('zentinelle.auth.gateway_token', level='WARNING') as captured:
            self.assertEqual(self.resolve(), '')

        self.assertIn('not writable', '\n'.join(captured.output))
        self.assertEqual(os.listdir(self.dir), [])

    def test_the_reason_is_logged_once_rather_than_per_lookup(self):
        path = os.path.join(self.dir, 'not-mounted', 'gateway-token')

        with self.assertLogs('zentinelle.auth.gateway_token', level='WARNING') as captured:
            for _ in range(3):
                self.resolve(ZENTINELLE_GATEWAY_TOKEN_FILE=path)

        self.assertEqual(len(captured.records), 1)

    def test_a_short_token_file_is_refused_without_echoing_it(self):
        write_token(self.path, 'tiny-token\n')

        with self.assertLogs('zentinelle.auth.gateway_token', level='ERROR') as captured:
            self.assertEqual(self.resolve(), '')

        self.assertNotIn('tiny-token', '\n'.join(captured.output))

    def test_a_replica_that_loses_the_race_uses_the_winners_token(self):
        # Another replica links its token into place between this one writing
        # its temporary file and linking it.
        winner = 'winning-replica-token-' + 'w' * 42
        real_link = os.link

        def another_replica_links_first(source, destination):
            with open(destination, 'x', encoding='utf-8') as handle:
                handle.write(winner)
            return real_link(source, destination)

        with patch.object(gateway_token_module.os, 'link', side_effect=another_replica_links_first):
            token = self.resolve()

        self.assertEqual(token, winner)
        self.assertEqual(self.read(), winner)
        self.assertEqual(os.listdir(self.dir), ['gateway-token'])

    def test_replicas_starting_together_agree_on_one_token(self):
        starting = threading.Barrier(8)
        tokens = []

        def start():
            starting.wait()
            tokens.append(gateway_token())

        with override_settings(ZENTINELLE_GATEWAY_TOKEN='', ZENTINELLE_GATEWAY_TOKEN_FILE=self.path), \
                self.assertLogs('zentinelle.auth.gateway_token', level='INFO') as captured:
            replicas = [threading.Thread(target=start) for _ in range(8)]
            for replica in replicas:
                replica.start()
            for replica in replicas:
                replica.join()

        self.assertEqual(len(tokens), 8)
        self.assertEqual(set(tokens), {self.read()})
        self.assertEqual(sum('Minted' in line for line in captured.output), 1)
        self.assertEqual(os.listdir(self.dir), ['gateway-token'])


class GatewayTokenScriptTests(SimpleTestCase):
    """`make gateway-token`: one random token in the .env both services read."""

    script = Path(__file__).resolve().parents[3] / 'scripts' / 'gateway-token.sh'

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.env_file = Path(directory.name) / '.env'

    def run_script(self):
        return subprocess.run(['sh', str(self.script), str(self.env_file)],
                              capture_output=True, text=True, check=True)

    def token_lines(self):
        return [line for line in self.env_file.read_text().splitlines()
                if line.startswith('ZENTINELLE_GATEWAY_TOKEN=')]

    def test_the_empty_placeholder_is_filled_and_never_printed(self):
        self.env_file.write_text('SECRET_KEY=x\nZENTINELLE_GATEWAY_TOKEN=\nFAIL_OPEN=false')

        result = self.run_script()

        lines = self.token_lines()
        self.assertEqual(len(lines), 1)
        token = lines[0].split('=', 1)[1]
        self.assertRegex(token, r'^[0-9a-f]{64}$')
        self.assertNotIn(token, result.stdout + result.stderr)
        self.assertEqual(self.env_file.read_text().splitlines()[0], 'SECRET_KEY=x')
        self.assertEqual(self.env_file.read_text().splitlines()[-1], 'FAIL_OPEN=false')

    def test_a_new_env_file_is_private_and_its_token_never_replaced(self):
        self.run_script()
        first = self.env_file.read_bytes()
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode) & 0o077, 0)

        result = self.run_script()

        self.assertEqual(self.env_file.read_bytes(), first)
        self.assertIn('already set', result.stdout)

    def test_a_file_without_the_line_gets_it_on_a_line_of_its_own(self):
        self.env_file.write_text('FAIL_OPEN=false')

        self.run_script()

        lines = self.env_file.read_text().splitlines()
        self.assertEqual(lines[0], 'FAIL_OPEN=false')
        self.assertRegex(lines[1], r'^ZENTINELLE_GATEWAY_TOKEN=[0-9a-f]{64}$')
