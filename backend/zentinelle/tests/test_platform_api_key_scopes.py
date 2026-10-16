"""Portal-minted platform API keys carry the scopes the operator picked.

Before the fix every key minted on settings/api-keys got read+write: the
GraphQL wrapper passed `scopes` positionally into the resolver's
`description`, the resolver then defaulted to read+write, and the page offered
`agents:read`-style scopes that nothing enforces. A "read-only" key created
agents. The page's own list query also asked for a field the schema does not
have (`createdBy`), so the key could be neither seen nor revoked there.
"""
import re
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from graphql import build_schema, parse, validate
from rest_framework.test import APIClient

from zentinelle.auth.resolver import StandaloneTenantResolver
from zentinelle.auth.roles import ROLE_ADMIN, assign_role
from zentinelle.models import AgentEndpoint, APIKey
from zentinelle.schema import schema

# A portal session resolves to this tenant in standalone mode.
PORTAL_TENANT = '00000000-0000-0000-0000-000000000001'
OTHER_TENANT = '00000000-0000-0000-0000-00000000000b'

CREATE = """mutation($name: String!, $scopes: [String!]) {
  createPlatformApiKey(name: $name, scopes: $scopes) { apiKey keyId ok error } }"""
REVOKE = """mutation($id: ID!) { revokeApiKey(id: $id) { ok error } }"""

FRONTEND_API_KEYS = Path(__file__).resolve().parents[3] / 'frontend' / 'graphql' / 'api-keys'


def _frontend_documents(filename):
    """The exact documents settings/api-keys sends, keyed by constant name."""
    source = (FRONTEND_API_KEYS / filename).read_text()
    return dict(re.findall(r'export const (\w+) = gql`(.*?)`', source, re.S))


def _frontend_api_keys_query():
    return _frontend_documents('queries.ts')['GET_API_KEYS']


def _key(tenant_id, name, scopes):
    _, key_hash, key_prefix = APIKey.generate_api_key()
    return APIKey.objects.create(tenant_id=tenant_id, name=name, key_prefix=key_prefix,
                                 key_hash=key_hash, scopes=scopes)


@override_settings(AUTH_MODE='local')
class PlatformAPIKeyScopeTests(TestCase):

    def setUp(self):
        user = get_user_model().objects.create_user(username='keys-admin', password='test-only-pass')
        assign_role(user, ROLE_ADMIN)
        self.portal = APIClient()
        self.portal.force_login(user)

    def gql(self, query, **variables):
        body = {'query': query, 'variables': variables}
        return self.portal.post('/gql/zentinelle/', body, format='json').json()

    def mint(self, scopes):
        return self.gql(CREATE, name='probe', scopes=scopes)['data']['createPlatformApiKey']

    def test_the_picked_scopes_are_stored(self):
        payload = self.mint(['read'])
        self.assertTrue(payload['ok'], payload)
        key = APIKey.objects.get(pk=payload['keyId'])
        self.assertEqual(key.scopes, ['read'])
        self.assertEqual(key.description, '', 'scopes landed in description')

    def test_a_read_only_key_reads_but_cannot_create_agents(self):
        token = self.mint(['read'])['apiKey']
        api = APIClient()
        api.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(api.get('/api/zentinelle/v1/operator/agents').status_code, 200)
        created = api.post('/api/zentinelle/v1/operator/agents',
                           {'agent_id': 'minted-by-readonly-key', 'name': 'x'}, format='json')
        self.assertEqual(created.status_code, 403, created.content)
        self.assertFalse(AgentEndpoint.objects.filter(agent_id='minted-by-readonly-key').exists())

    def test_scopes_nothing_enforces_are_refused(self):
        for scopes in (['agents:read'], ['*'], ['read', 'audit:read']):
            payload = self.mint(scopes)
            self.assertFalse(payload['ok'], scopes)
            self.assertIn('unknown_scopes', payload['error'])
            self.assertIsNone(payload['apiKey'])
        self.assertFalse(APIKey.objects.exists())

    def test_no_scopes_is_refused_and_omitted_scopes_mean_read_only(self):
        self.assertEqual(self.mint([])['error'], 'scopes_required')
        payload = self.gql(CREATE, name='default')['data']['createPlatformApiKey']
        self.assertTrue(payload['ok'], payload)
        self.assertEqual(APIKey.objects.get(pk=payload['keyId']).scopes, ['read'])

    def test_the_settings_page_lists_its_tenants_keys_and_can_revoke_them(self):
        mine = _key(PORTAL_TENANT, 'mine', ['read'])
        _key(OTHER_TENANT, 'theirs', ['read', 'write'])

        listed = self.gql(_frontend_api_keys_query())
        self.assertNotIn('errors', listed)
        self.assertEqual([k['name'] for k in listed['data']['apiKeys']], ['mine'])

        self.assertTrue(self.gql(REVOKE, id=str(mine.pk))['data']['revokeApiKey']['ok'])
        after = self.gql(_frontend_api_keys_query())['data']['apiKeys']
        self.assertEqual([(k['name'], k['status']) for k in after], [('mine', 'revoked')])


class FrontendDocumentsMatchSchemaTests(SimpleTestCase):

    def test_every_api_keys_document_validates_against_the_printed_schema(self):
        printed = build_schema(schema.as_str())
        docs = {**_frontend_documents('queries.ts'), **_frontend_documents('mutations.ts')}
        self.assertEqual(len(docs), 4)
        for name, document in docs.items():
            with self.subTest(name):
                self.assertEqual(validate(printed, parse(document)), [])


class ResolverScopeFallbackTests(TestCase):

    def test_a_key_with_no_scopes_gets_none(self):
        full_key, key_hash, key_prefix = APIKey.generate_api_key()
        APIKey.objects.create(tenant_id=PORTAL_TENANT, name='empty', key_prefix=key_prefix,
                              key_hash=key_hash, scopes=[])
        auth = StandaloneTenantResolver()._validate_platform_key(full_key)
        self.assertTrue(auth.valid)
        self.assertEqual(auth.scopes, [])
