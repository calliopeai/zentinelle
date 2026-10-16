"""Shared two-tenant fixture for tenant-isolation tests.

Two tenants, each with an agent named `shared-bot`: agent_id is unique per
tenant only, so the same name in both is what exposes anything keyed by name
alone. Every assertion is about tenant B's view of tenant A's data, or the
other way round.

Tenant A is the standalone tenant, the one a portal user belongs to, so the
same fixture serves REST, GraphQL and the proxy. `_two_tenants` is the
agent-only variant, where neither tenant is the portal's.
"""
import json

from django.core.cache import cache
from django.test import Client, TestCase

from zentinelle.models import AgentEndpoint

TENANT_A = '00000000-0000-0000-0000-000000000001'
TENANT_B = '00000000-0000-0000-0000-0000000000bb'
SHARED_AGENT_ID = 'shared-bot'


def make_agent(tenant_id, agent_id=SHARED_AGENT_ID, **fields):
    """An active agent in `tenant_id`, and its plaintext key."""
    key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
    fields.setdefault('name', agent_id)
    fields.setdefault('status', AgentEndpoint.Status.ACTIVE)
    endpoint = AgentEndpoint.objects.create(
        tenant_id=tenant_id, agent_id=agent_id,
        api_key_hash=key_hash, api_key_prefix=key_prefix, **fields)
    return endpoint, key


class TwoTenantTestCase(TestCase):
    """`agent_a`/`key_a` in TENANT_A and `agent_b`/`key_b` in TENANT_B."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.addCleanup(cache.clear)
        self.agent_a, self.key_a = make_agent(TENANT_A)
        self.agent_b, self.key_b = make_agent(TENANT_B)

    def evaluate(self, key, context=None, action='tool_call', **fields):
        """POST /evaluate as the agent holding `key`; returns the response."""
        return Client().post(
            '/api/zentinelle/v1/evaluate',
            data=json.dumps({'action': action, 'context': context or {}, **fields}),
            content_type='application/json', HTTP_X_ZENTINELLE_KEY=key)
