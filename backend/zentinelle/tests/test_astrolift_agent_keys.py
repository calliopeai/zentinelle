"""Per-task agent keys an Astrolift install mints for its own workloads (#400).

Astrolift gives each agent task and box its own short-lived agent key and
points the pod at the gateway in its cluster, so no provider key enters the
pod (calliopeai/astrolift-app#1851). The install credential is what mints
them, scoped to the install's tenants. The provider-key lookup is the proof
that a minted key works: it is what the gateway asks for on every request.
"""
from datetime import timedelta

from django.test import TestCase
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
        AgentEndpoint.objects.filter(agent_id=AGENT).update(api_key_expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(config(key).status_code, 401)

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
