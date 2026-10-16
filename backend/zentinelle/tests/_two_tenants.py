"""Shared two-tenant fixture: one agent and one authenticated client per tenant.

Tenant isolation tests assert that nothing tenant B sends can reach or change
tenant A's rows, so every such test needs the same two tenants, set up the same
way. Use `TwoTenantMixin` with a Django `TestCase`. Neither tenant is the
portal's standalone tenant; `_two_tenants_portal` is the variant whose tenant A
is, for tests that also go through a portal session.
"""
from rest_framework.test import APIClient

from zentinelle.models import AgentEndpoint

TENANT_A = '00000000-0000-0000-0000-00000000000a'
TENANT_B = '00000000-0000-0000-0000-00000000000b'


def make_endpoint(tenant_id, agent_id):
    """An active agent and its plaintext key."""
    key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
    endpoint = AgentEndpoint.objects.create(
        tenant_id=tenant_id,
        agent_id=agent_id,
        name=agent_id,
        agent_type=AgentEndpoint.AgentType.CUSTOM,
        api_key_hash=key_hash,
        api_key_prefix=key_prefix,
        status=AgentEndpoint.Status.ACTIVE,
    )
    return endpoint, key


def agent_client(key):
    client = APIClient()
    client.credentials(HTTP_X_ZENTINELLE_KEY=key)
    return client


class TwoTenantMixin:
    """`self.endpoint_a`/`self.client_a` in TENANT_A, `_b` in TENANT_B.

    Both agents share an agent_id on purpose: agent_id is unique per tenant
    only, so a lookup that forgets the tenant finds the wrong one.
    """

    agent_id = 'shared-agent'

    def setUp(self):
        super().setUp()
        self.endpoint_a, self.key_a = make_endpoint(TENANT_A, self.agent_id)
        self.endpoint_b, self.key_b = make_endpoint(TENANT_B, self.agent_id)
        self.client_a = agent_client(self.key_a)
        self.client_b = agent_client(self.key_b)
