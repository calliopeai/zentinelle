"""Portal auth contract: effective policy over a session, distinct auth error codes.

The Effective Policy Viewer called an agent-key-only view with a session, so
every signed-in operator got 401, and the endpoint they picked was never sent.
GraphQL answered "no session" and "role too low" with the same FORBIDDEN code,
so the portal could not tell an expired session from a refusal.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_VIEWER, assign_role
from zentinelle.models import AgentEndpoint, Policy

# The tenant a portal session resolves to in standalone mode.
TENANT_A = '00000000-0000-0000-0000-000000000001'
TENANT_B = '00000000-0000-0000-0000-00000000000b'
URL = '/api/zentinelle/v1/effective-policy'


def _endpoint(tenant_id, agent_id):
    key, key_hash, prefix = AgentEndpoint.generate_api_key()
    endpoint = AgentEndpoint.objects.create(
        tenant_id=tenant_id, agent_id=agent_id, name=agent_id,
        agent_type=AgentEndpoint.AgentType.CUSTOM,
        api_key_hash=key_hash, api_key_prefix=prefix,
    )
    return endpoint, key


def _org_policy(tenant_id, name):
    return Policy.objects.create(
        tenant_id=tenant_id, name=name,
        policy_type=Policy.PolicyType.RATE_LIMIT,
        scope_type=Policy.ScopeType.ORGANIZATION,
        enforcement=Policy.Enforcement.ENFORCE,
        config={'requests_per_minute': 7},
    )


@override_settings(AUTH_MODE='local')
class EffectivePolicySessionTests(TestCase):
    """Two tenants, each with an endpoint and an org policy."""

    def setUp(self):
        self.ep_a, self.key_a = _endpoint(TENANT_A, 'shared-bot')
        self.ep_b, self.key_b = _endpoint(TENANT_B, 'shared-bot')
        _org_policy(TENANT_A, 'A limit')
        _org_policy(TENANT_B, 'B limit')
        user = get_user_model().objects.create_user(username='viewer', password='test-only-pass')
        assign_role(user, ROLE_VIEWER)
        self.portal = APIClient()
        self.portal.force_login(user)

    def names(self, response):
        return [p['name'] for p in response.json()['policies']]

    def test_a_signed_in_viewer_resolves_the_selected_endpoint(self):
        response = self.portal.get(URL, {'endpoint': str(self.ep_a.id)})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.names(response), ['A limit'])

        with_user = self.portal.get(f'{URL}/alice@example.com', {'endpoint': str(self.ep_a.id)})
        self.assertEqual(with_user.status_code, 200, with_user.content)

    def test_a_session_must_name_an_endpoint(self):
        self.assertEqual(self.portal.get(URL).status_code, 400)
        self.assertEqual(self.portal.get(URL, {'endpoint': 'not-a-uuid'}).status_code, 400)

    def test_a_session_cannot_resolve_another_tenants_endpoint(self):
        response = self.portal.get(URL, {'endpoint': str(self.ep_b.id)})
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b'B limit', response.content)

    def test_no_credentials_is_401(self):
        self.assertEqual(APIClient().get(URL, {'endpoint': str(self.ep_a.id)}).status_code, 401)

    def test_an_agent_key_resolves_its_own_endpoint_whatever_it_names(self):
        agent = APIClient()
        agent.credentials(HTTP_X_ZENTINELLE_KEY=self.key_b)
        response = agent.get(URL, {'endpoint': str(self.ep_a.id)})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(self.names(response), ['B limit'])

    def test_a_provisioning_endpoint_key_still_resolves(self):
        AgentEndpoint.objects.filter(id=self.ep_a.id).update(status=AgentEndpoint.Status.PROVISIONING)
        agent = APIClient()
        agent.credentials(HTTP_X_ZENTINELLE_KEY=self.key_a)
        self.assertEqual(agent.get(URL).status_code, 200)


@override_settings(AUTH_MODE='local')
class GraphQLAuthErrorCodeTests(TestCase):

    def gql(self, client, query):
        return client.post('/gql/zentinelle/', {'query': query}, format='json').json()

    def test_no_session_is_unauthenticated(self):
        result = self.gql(APIClient(), '{ policies { id } }')
        self.assertEqual(result['errors'][0]['extensions']['code'], 'UNAUTHENTICATED')

    def test_a_signed_in_user_below_the_role_is_forbidden(self):
        user = get_user_model().objects.create_user(username='viewer', password='test-only-pass')
        assign_role(user, ROLE_VIEWER)
        client = APIClient()
        client.force_login(user)
        result = self.gql(client, 'mutation { deleteApiKey(id: "x") { ok } }')
        self.assertEqual(result['errors'][0]['extensions']['code'], 'FORBIDDEN')
