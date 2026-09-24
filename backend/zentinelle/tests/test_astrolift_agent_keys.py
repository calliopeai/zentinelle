"""Per-task agent keys an Astrolift install mints for its own workloads (#400).

Astrolift gives each agent task and box its own short-lived agent key and
points the pod at the gateway in its cluster, so no provider key enters the
pod (calliopeai/astrolift-app#1851). The install credential is what mints
them, scoped to the install's tenants. The provider-key lookup is the proof
that a minted key works: it is what the gateway asks for on every request.
"""
from datetime import timedelta

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.models import AgentEndpoint, AuditLog
from zentinelle.tests.test_astrolift_clusters import (KEY_A, TENANT_A,
                                                      TENANT_B, TENANT_C,
                                                      as_install, audit_text,
                                                      connect_install,
                                                      make_agent, provider_key,
                                                      register, store_key)

AGENT = 'astrolift-task-0f6b3a52c1d94e7a8b2c9d0e1f2a3b4c'


def mint(install_credential, agent_id=AGENT, **body):
    return as_install(install_credential).post(
        reverse('zentinelle:astrolift-agents'), {'agent_id': agent_id, 'ttl_seconds': 900, **body},
        format='json')


def renew(install_credential, agent_id=AGENT, **body):
    return as_install(install_credential).post(
        reverse('zentinelle:astrolift-agent-renew', kwargs={'agent_id': agent_id}),
        {'ttl_seconds': 3600, **body}, format='json')


def revoke(install_credential, agent_id=AGENT):
    return as_install(install_credential).delete(
        reverse('zentinelle:astrolift-agent', kwargs={'agent_id': agent_id}))


def config(agent_key, agent_id=AGENT):
    """A request an agent makes with its key; 200 while the key is good."""
    client = APIClient()
    client.credentials(HTTP_X_ZENTINELLE_KEY=agent_key)
    return client.get(reverse('zentinelle:config', kwargs={'agent_id': agent_id}))


class AstroliftAgentKeyTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])

    def test_a_minted_key_gets_its_tenants_provider_key_through_the_installs_gateway(self):
        store_key(TENANT_A, KEY_A)
        gateway = register(self.credential, 'c1').json()['gateway']['credential']

        response = mint(self.credential, deployment_id='claude-reviewer', name='claude-reviewer task')

        self.assertEqual(response.status_code, 201, response.content)
        key = response.json()['api_key']
        self.assertTrue(key.startswith('sk_agent_'))
        self.assertEqual(provider_key(key, gateway).json()['api_key'], KEY_A)
        agent = AgentEndpoint.objects.get(tenant_id=TENANT_A, agent_id=AGENT)
        self.assertEqual(agent.astrolift_install, self.install)
        self.assertEqual(agent.deployment_id_ext, 'claude-reviewer')
        self.assertEqual(agent.name, 'claude-reviewer task')
        self.assertEqual(response.json()['agent']['tenant_id'], TENANT_A)

    def test_the_key_is_shown_once_expires_on_time_and_is_stored_as_a_hash(self):
        before = timezone.now()

        response = mint(self.credential, ttl_seconds=600)

        self.assertEqual(response['Cache-Control'], 'no-store')
        key = response.json()['api_key']
        agent = AgentEndpoint.objects.get(agent_id=AGENT)
        self.assertNotEqual(agent.api_key_hash, key)
        self.assertAlmostEqual((agent.api_key_expires_at - before).total_seconds(), 600, delta=30)
        self.assertEqual(response.json()['agent']['expires_at'], agent.api_key_expires_at.isoformat())
        self.assertEqual(config(key).status_code, 200)
        AgentEndpoint.objects.filter(pk=agent.pk).update(api_key_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(config(key).status_code, 401)

    def test_ttl_is_required_and_bounded(self):
        for ttl in (None, 0, -5, 30 * 24 * 3600 + 1, 'soon', True):
            body = {'agent_id': AGENT} if ttl is None else {'agent_id': AGENT, 'ttl_seconds': ttl}
            with self.subTest(ttl=ttl):
                response = as_install(self.credential).post(
                    reverse('zentinelle:astrolift-agents'), body, format='json')
                self.assertEqual(response.status_code, 400)
        self.assertFalse(AgentEndpoint.objects.filter(agent_id=AGENT).exists())

    def test_minting_again_replaces_the_key_and_brings_a_revoked_agent_back(self):
        first = mint(self.credential).json()['api_key']
        self.assertEqual(revoke(self.credential).status_code, 204)

        again = mint(self.credential)

        self.assertEqual(again.status_code, 200)
        second = again.json()['api_key']
        self.assertEqual(config(first).status_code, 401)
        self.assertEqual(config(second).status_code, 200)
        self.assertEqual(AgentEndpoint.objects.filter(agent_id=AGENT).count(), 1)

    def test_an_agent_the_install_did_not_mint_is_never_taken_over(self):
        existing = make_agent(TENANT_A, AGENT)

        response = mint(self.credential)

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['error'], 'agent_id_taken')
        self.assertNotIn('api_key', response.json())
        self.assertEqual(config(existing).status_code, 200)
        self.assertEqual(revoke(self.credential).status_code, 404)
        self.assertEqual(renew(self.credential).status_code, 404)

    def test_renew_moves_the_expiry_of_a_live_key(self):
        key = mint(self.credential, ttl_seconds=60).json()['api_key']

        response = renew(self.credential, ttl_seconds=3600)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertNotIn('api_key', response.json())
        agent = AgentEndpoint.objects.get(agent_id=AGENT)
        self.assertAlmostEqual((agent.api_key_expires_at - timezone.now()).total_seconds(), 3600, delta=30)
        self.assertEqual(config(key).status_code, 200)
        for ttl in (0, 30 * 24 * 3600 + 1):
            self.assertEqual(renew(self.credential, ttl_seconds=ttl).status_code, 400)

    def test_a_revoked_key_is_refused_from_the_next_request_and_cannot_be_renewed(self):
        key = mint(self.credential).json()['api_key']

        self.assertEqual(revoke(self.credential).status_code, 204)

        self.assertEqual(config(key).status_code, 401)
        self.assertEqual(AgentEndpoint.objects.get(agent_id=AGENT).status, AgentEndpoint.Status.TERMINATED)
        refused = renew(self.credential)
        self.assertEqual(refused.status_code, 404)
        self.assertEqual(refused.json()['error'], 'agent_not_found')
        self.assertEqual(revoke(self.credential).status_code, 204)
        self.assertEqual(AuditLog.objects.filter(action='astrolift.agent_key.revoked').count(), 1)
        self.assertEqual(revoke(self.credential, 'astrolift-task-unknown').status_code, 404)

    def test_mint_and_revoke_are_audited_in_the_keys_tenant_without_the_key(self):
        key = mint(self.credential).json()['api_key']
        revoke(self.credential)

        minted = AuditLog.objects.get(action='astrolift.agent_key.minted')
        revoked = AuditLog.objects.get(action='astrolift.agent_key.revoked')
        self.assertEqual((minted.tenant_id, revoked.tenant_id), (TENANT_A, TENANT_A))
        self.assertEqual(minted.metadata['key_prefix'], key[:12])
        self.assertEqual(minted.metadata['install_id'], str(self.install.id))
        self.assertNotIn(key, audit_text())
        self.assertNotIn(key[12:], audit_text())

    def test_disconnecting_the_install_terminates_the_agents_it_minted(self):
        first = mint(self.credential).json()['api_key']
        second = mint(self.credential, 'astrolift-box-5d1c').json()['api_key']
        bystander = make_agent(TENANT_A, 'hand-registered')

        response = as_install(self.credential).delete(reverse('zentinelle:astrolift-install'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(config(first).status_code, 401)
        self.assertEqual(config(second, 'astrolift-box-5d1c').status_code, 401)
        self.assertEqual(config(bystander, 'hand-registered').status_code, 200)
        record = AuditLog.objects.get(action='astrolift.install.disconnected')
        self.assertEqual(record.metadata['agents_terminated'], 2)
        self.assertEqual(mint(self.credential).status_code, 401)

    def test_another_install_on_the_same_tenant_cannot_touch_the_key(self):
        key = mint(self.credential).json()['api_key']
        other, _ = connect_install([TENANT_A], name='astro-other')

        self.assertEqual(renew(other).status_code, 404)
        self.assertEqual(revoke(other).status_code, 404)
        self.assertEqual(mint(other).status_code, 409)
        self.assertEqual(config(key).status_code, 200)

    def test_no_credential_or_a_wrong_one_mints_nothing(self):
        self.assertEqual(
            APIClient().post(reverse('zentinelle:astrolift-agents'), {'agent_id': AGENT, 'ttl_seconds': 60},
                             format='json').status_code, 401)
        self.assertEqual(mint('sk_astroinst_not-a-real-credential').status_code, 401)
        self.assertFalse(AgentEndpoint.objects.filter(agent_id=AGENT).exists())


class AstroliftAgentKeyTenantTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A, TENANT_B])

    def test_an_install_of_several_tenants_names_one_that_it_serves(self):
        ambiguous = mint(self.credential)
        outside = mint(self.credential, tenant_id=TENANT_C)
        inside = mint(self.credential, tenant_id=TENANT_B)

        self.assertEqual((ambiguous.status_code, ambiguous.json()['error']), (400, 'tenant_required'))
        self.assertEqual((outside.status_code, outside.json()['error']), (403, 'tenant_not_in_install_scope'))
        self.assertEqual(inside.status_code, 201)
        self.assertEqual(AgentEndpoint.objects.get(agent_id=AGENT).tenant_id, TENANT_B)
        self.assertEqual(AuditLog.objects.get(action='astrolift.agent_key.minted').tenant_id, TENANT_B)


class AgentKeyPrefixCollisionTests(TestCase):
    """Two live keys can share the stored prefix, `sk_agent_` and three characters."""

    def test_each_key_still_authenticates_as_its_own_agent(self):
        from zentinelle.utils.api_keys import hash_api_key

        first, first_hash, prefix = AgentEndpoint.generate_api_key()
        second = prefix + 'x' * (len(first) - len(prefix))
        for agent_id, key_hash in (('first', first_hash), ('second', hash_api_key(second))):
            AgentEndpoint.objects.create(tenant_id=TENANT_A, agent_id=agent_id, name=agent_id,
                                         api_key_hash=key_hash, api_key_prefix=prefix)

        self.assertEqual(config(first, 'first').status_code, 200)
        self.assertEqual(config(second, 'second').status_code, 200)
        self.assertEqual(config(second, 'first').status_code, 403)
        self.assertEqual(config(prefix + 'y' * 5, 'first').status_code, 401)


STANDALONE = '00000000-0000-0000-0000-000000000001'


@override_settings(AUTH_MODE='local')
class AdministratorStopTests(TestCase):
    """A stop by anyone but the minting install stands: the next mint is refused (409 agent_suspended)."""

    def setUp(self):
        self.credential, self.install = connect_install([STANDALONE])
        self.key = mint(self.credential).json()['api_key']

    def agent(self):
        return AgentEndpoint.objects.get(tenant_id=STANDALONE, agent_id=AGENT)

    def assert_stays_stopped(self, status):
        refused = mint(self.credential)
        self.assertEqual((refused.status_code, refused.json()['error']), (409, 'agent_suspended'))
        self.assertNotIn('api_key', refused.json())
        renewal = renew(self.credential)
        self.assertEqual((renewal.status_code, renewal.json()['error']), (409, 'agent_suspended'))
        self.assertEqual(config(self.key).status_code, 401)
        self.assertEqual(self.agent().status, status)
        # Revoking it again leaves the administrator's stop as it is.
        self.assertEqual(revoke(self.credential).status_code, 204)
        self.assertEqual(self.agent().status, status)
        self.assertIsNone(self.agent().astrolift_revoked_at)
        self.assertEqual(mint(self.credential).status_code, 409)

    def portal_mutation(self, query, **variables):
        from zentinelle.schema import schema
        from zentinelle.tests._graphql_helpers import admin_context
        result = schema.execute_sync(query, variable_values=variables, context_value=admin_context(STANDALONE))
        self.assertIsNone(result.errors, result.errors)
        return result.data

    def kill_switch(self, action):
        from django.contrib.auth import get_user_model

        from zentinelle.auth.roles import ROLE_ADMIN, assign_role
        user = get_user_model().objects.create_user(username=f'admin-{action}', password='test-only-pass')
        assign_role(user, ROLE_ADMIN)
        client = APIClient()
        client.force_login(user)
        response = client.post(reverse('zentinelle:agent-control', kwargs={'agent_id': AGENT}),
                               {'action': action}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    def operator_delete(self):
        from types import SimpleNamespace

        from zentinelle.api.auth import ZentinelleServiceUser
        operator = ZentinelleServiceUser(SimpleNamespace(
            tenant_id=STANDALONE, scopes=['read', 'write'], is_active=True, pk=1, id=1))
        client = APIClient()
        client.force_authenticate(user=operator)
        response = client.delete(reverse('zentinelle:operator-agent', kwargs={'agent_id': AGENT}))
        self.assertEqual(response.status_code, 204)

    def test_a_portal_suspend_stands(self):
        data = self.portal_mutation(
            'mutation($id: ID!) { suspendAgentEndpoint(id: $id) { success error } }', id=str(self.agent().id))
        self.assertTrue(data['suspendAgentEndpoint']['success'], data)

        self.assert_stays_stopped(AgentEndpoint.Status.SUSPENDED)

    def test_a_portal_status_change_stands_even_after_the_installs_own_revoke(self):
        self.assertEqual(revoke(self.credential).status_code, 204)
        data = self.portal_mutation(
            'mutation($id: ID!, $status: String!) { updateEndpointStatus(id: $id, status: $status) { success } }',
            id=str(self.agent().id), status='terminated')
        self.assertTrue(data['updateEndpointStatus']['success'], data)

        self.assert_stays_stopped(AgentEndpoint.Status.TERMINATED)

    def test_the_kill_switch_suspend_stands(self):
        self.kill_switch('suspend')

        self.assert_stays_stopped(AgentEndpoint.Status.SUSPENDED)

    def test_the_kill_switch_emergency_stop_stands_even_after_the_installs_own_revoke(self):
        self.assertEqual(revoke(self.credential).status_code, 204)
        self.kill_switch('emergency_stop')

        self.assert_stays_stopped(AgentEndpoint.Status.TERMINATED)

    def test_an_operator_delete_stands(self):
        self.operator_delete()

        self.assert_stays_stopped(AgentEndpoint.Status.TERMINATED)

    def test_an_operator_delete_stands_even_after_the_installs_own_revoke(self):
        self.assertEqual(revoke(self.credential).status_code, 204)
        self.operator_delete()

        self.assert_stays_stopped(AgentEndpoint.Status.TERMINATED)

    def test_the_agents_own_deregister_stands(self):
        client = APIClient()
        client.credentials(HTTP_X_ZENTINELLE_KEY=self.key)
        self.assertEqual(client.post(reverse('zentinelle:deregister'), {}, format='json').status_code, 204)

        self.assert_stays_stopped(AgentEndpoint.Status.TERMINATED)

    def test_only_the_installs_own_revoke_is_undone_by_a_mint(self):
        self.assertEqual(revoke(self.credential).status_code, 204)
        self.assertIsNotNone(self.agent().astrolift_revoked_at)

        again = mint(self.credential)

        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(config(again.json()['api_key']).status_code, 200)
        self.assertIsNone(self.agent().astrolift_revoked_at)


class AgentKeyExpiryAndLifetimeTests(TestCase):
    def setUp(self):
        self.credential, self.install = connect_install([TENANT_A])

    def shift(self, **fields):
        AgentEndpoint.objects.filter(agent_id=AGENT).update(**fields)

    def test_an_expired_key_is_not_renewed_but_can_be_minted_again(self):
        key = mint(self.credential).json()['api_key']
        self.shift(api_key_expires_at=timezone.now() - timedelta(seconds=1))

        refused = renew(self.credential)

        self.assertEqual((refused.status_code, refused.json()['error']), (409, 'agent_key_expired'))
        self.assertEqual(config(key).status_code, 401)
        fresh = mint(self.credential)
        self.assertEqual(fresh.status_code, 200)
        self.assertEqual(config(fresh.json()['api_key']).status_code, 200)

    @override_settings(ASTROLIFT_AGENT_KEY_MAX_LIFETIME_SECONDS=3600)
    def test_no_key_outlives_its_lifetime_however_it_is_renewed(self):
        before = timezone.now()
        minted = mint(self.credential, ttl_seconds=7200).json()

        agent = AgentEndpoint.objects.get(agent_id=AGENT)
        self.assertAlmostEqual((agent.api_key_expires_at - before).total_seconds(), 3600, delta=30)
        self.assertEqual(minted['agent']['lifetime_ends_at'], minted['agent']['expires_at'])

        # Fifty minutes into its hour, with five left before it expires.
        issued = timezone.now() - timedelta(minutes=50)
        self.shift(api_key_issued_at=issued, api_key_expires_at=timezone.now() + timedelta(minutes=5))
        renewed = renew(self.credential, ttl_seconds=3600)

        self.assertEqual(renewed.status_code, 200, renewed.content)
        agent.refresh_from_db()
        self.assertEqual(agent.api_key_expires_at, issued + timedelta(hours=1))
        self.assertEqual(renewed.json()['agent']['expires_at'], renewed.json()['agent']['lifetime_ends_at'])

        self.shift(api_key_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(renew(self.credential).json()['error'], 'agent_key_expired')
        again = mint(self.credential).json()['agent']
        self.assertGreater(again['lifetime_ends_at'], (timezone.now() + timedelta(minutes=59)).isoformat())


class ConcurrentMintTests(TestCase):
    def test_losing_a_race_for_a_new_agent_id_is_a_409_not_a_500(self):
        from unittest.mock import patch

        first, _ = connect_install([TENANT_A])
        second, _ = connect_install([TENANT_A], name='astro-other')
        self.assertEqual(mint(first).status_code, 201)

        # The other install's insert lands between this one's lookup and insert.
        with patch('zentinelle.services.astrolift_clusters._existing_agent', return_value=None):
            response = mint(second)

        self.assertEqual((response.status_code, response.json()['error']), (409, 'agent_id_taken'))
        self.assertEqual(AgentEndpoint.objects.filter(agent_id=AGENT).count(), 1)


class EveryStopClearsTheInstallsRevokeTests(TestCase):
    """A guard for stop paths added later: whoever sets an agent's status to
    suspended or terminated (or to a status from input) must also decide
    about `astrolift_revoked_at`, or a mint could undo that stop (#400)."""

    STOPS = {'SUSPENDED', 'TERMINATED'}

    def is_stop(self, value):
        """AgentEndpoint.Status.SUSPENDED or TERMINATED, or a status the code cannot know (from input)."""
        import ast
        if isinstance(value, ast.IfExp):
            return self.is_stop(value.body) or self.is_stop(value.orelse)
        if isinstance(value, ast.Attribute):
            owner = value.value
            return (value.attr in self.STOPS and isinstance(owner, ast.Attribute) and owner.attr == 'Status'
                    and isinstance(owner.value, ast.Name) and owner.value.id == 'AgentEndpoint')
        if isinstance(value, ast.Constant):
            return value.value in ('suspended', 'terminated')
        return True

    def stop_writes(self, function):
        import ast
        for node in ast.walk(function):
            values = []
            if isinstance(node, ast.Assign) and any(
                    isinstance(t, ast.Attribute) and t.attr == 'status' for t in node.targets):
                values.append(node.value)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'update':
                values.extend(kw.value for kw in node.keywords if kw.arg == 'status')
            if any(self.is_stop(value) for value in values):
                yield node

    def test_every_function_that_stops_an_agent_handles_the_marker(self):
        import ast
        from pathlib import Path

        import zentinelle
        root = Path(zentinelle.__file__).parent
        unhandled, found = [], 0
        for path in root.rglob('*.py'):
            if 'tests' in path.parts or 'migrations' in path.parts:
                continue
            tree = ast.parse(path.read_text())
            for function in ast.walk(tree):
                if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                source = ast.dump(function)
                if "'AgentEndpoint'" not in source or not list(self.stop_writes(function)):
                    continue
                found += 1
                if 'astrolift_revoked_at' not in source:
                    unhandled.append(f'{path.relative_to(root)}:{function.name}')
        self.assertGreaterEqual(found, 7)
        self.assertEqual(unhandled, [])
