"""Short-lived, revocable agent keys minted through the operator API (#379).

Platforms such as Astrolift mint one key per agent task and revoke it when
the task stops, so a leaked key is only useful for the life of that task.
"""
from datetime import timedelta
from types import SimpleNamespace

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.api.auth import ZentinelleServiceUser
from zentinelle.auth.resolver import StandaloneTenantResolver
from zentinelle.models import AgentEndpoint

TENANT = '00000000-0000-0000-0000-000000000001'
OTHER_TENANT = '00000000-0000-0000-0000-000000000002'


def _operator(tenant=TENANT, scopes=('read', 'write')):
    record = SimpleNamespace(tenant_id=tenant, scopes=list(scopes), is_active=True, pk=1, id=1)
    return ZentinelleServiceUser(record)


class OperatorAgentKeyTTLTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=_operator())

    def _mint(self, **extra):
        return self.client.post(
            reverse('zentinelle:operator-agents'),
            {'agent_id': 'astrolift-task-1', 'name': 'task 1', **extra},
            format='json',
        )

    def test_mint_with_ttl_returns_and_stores_expiry(self):
        before = timezone.now()
        response = self._mint(ttl_seconds=600)

        self.assertEqual(response.status_code, 201)
        endpoint = AgentEndpoint.objects.get(tenant_id=TENANT, agent_id='astrolift-task-1')
        self.assertGreaterEqual(endpoint.api_key_expires_at, before + timedelta(seconds=600))
        self.assertEqual(response.data['expires_at'], endpoint.api_key_expires_at.isoformat())

    def test_mint_without_ttl_never_expires(self):
        response = self._mint()

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data['expires_at'])
        self.assertIsNone(AgentEndpoint.objects.get(agent_id='astrolift-task-1').api_key_expires_at)

    def test_out_of_range_ttl_is_refused(self):
        for bad in (0, -5, 30 * 24 * 3600 + 1, 'soon', True):
            response = self._mint(ttl_seconds=bad)
            self.assertEqual(response.status_code, 400, bad)
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='astrolift-task-1').exists())


class AgentKeyExpiryTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=TENANT,
            agent_id='astrolift-task-2',
            name='task 2',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            api_key_expires_at=timezone.now() + timedelta(minutes=5),
        )
        self.url = reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})

    def _expire(self):
        AgentEndpoint.objects.filter(pk=self.endpoint.pk).update(
            api_key_expires_at=timezone.now() - timedelta(seconds=1))

    def test_unexpired_key_authenticates(self):
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_expired_key_is_refused_by_the_api(self):
        self._expire()
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_expired_key_is_refused_by_the_resolver(self):
        resolver = StandaloneTenantResolver()
        self.assertTrue(resolver._validate_agent_key(self.full_key).valid)
        self._expire()
        self.assertFalse(resolver._validate_agent_key(self.full_key).valid)


class OperatorAgentRevokeTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=TENANT, agent_id='astrolift-task-3', name='task 3',
            api_key_hash=key_hash, api_key_prefix=key_prefix,
        )

    def _delete(self, operator):
        self.client.force_authenticate(user=operator)
        return self.client.delete(
            reverse('zentinelle:operator-agent', kwargs={'agent_id': 'astrolift-task-3'}))

    def test_revoked_key_is_refused_on_the_next_request(self):
        self.assertEqual(self._delete(_operator()).status_code, 204)

        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)
        url = reverse('zentinelle:config', kwargs={'agent_id': 'astrolift-task-3'})
        self.assertEqual(self.client.get(url).status_code, 401)
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.status, AgentEndpoint.Status.TERMINATED)

    def test_another_tenant_cannot_revoke(self):
        self.assertEqual(self._delete(_operator(tenant=OTHER_TENANT)).status_code, 404)
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.status, AgentEndpoint.Status.ACTIVE)

    def test_read_only_operator_cannot_revoke(self):
        self.assertEqual(self._delete(_operator(scopes=('read',))).status_code, 403)
