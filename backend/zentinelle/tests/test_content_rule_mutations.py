"""Content-rule mutations work from the portal and stay in the caller's tenant (#407).

Each of these failed on every call before: create imported a client-cove app,
update and toggle had schema fields that did not match their resolvers, and
every lookup decoded the portal's raw UUIDs to an empty id.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_OPERATOR, ROLE_VIEWER, assign_role
from zentinelle.models import AgentEndpoint, ContentRule

# The tenant a portal session resolves to in standalone mode.
TENANT = '00000000-0000-0000-0000-000000000001'

CREATE = """mutation($input: CreateContentRuleInput!) {
  createContentRule(input: $input) { success ruleId errors } }"""
UPDATE = """mutation($input: UpdateContentRuleInput!) {
  updateContentRule(input: $input) { success ruleId errors } }"""
TOGGLE = """mutation($id: ID!, $enabled: Boolean!) {
  toggleContentRuleEnabled(id: $id, enabled: $enabled) { success ruleId } }"""
DUPLICATE = """mutation($id: ID!, $newName: String) {
  duplicateContentRule(id: $id, newName: $newName) { success ruleId errors } }"""
DELETE = """mutation($id: ID!) { deleteContentRule(id: $id) { success errors } }"""
TEST = """mutation($id: ID!, $content: String!) {
  testContentRule(id: $id, content: $content) { success matched errors } }"""


@override_settings(AUTH_MODE='local')
class ContentRuleMutationTests(TestCase):

    def setUp(self):
        self.client = self.portal('rules-editor', ROLE_OPERATOR)

    @staticmethod
    def portal(username, role):
        user = get_user_model().objects.create_user(username=username, password='test-only-pass')
        assign_role(user, role)
        client = APIClient()
        client.force_login(user)
        return client

    def gql(self, query, client=None, **variables):
        body = {'query': query, 'variables': variables}
        return (client or self.client).post('/gql/zentinelle/', body, format='json').json()

    def test_the_portal_can_create_edit_toggle_duplicate_test_and_delete(self):
        created = self.gql(CREATE, input={'name': 'Tickets', 'ruleType': 'custom_pattern', 'action': 'warn',
                                          'config': {'patterns': ['PROJ-\\d+']}})['data']['createContentRule']
        self.assertTrue(created['success'], created)
        rule = ContentRule.objects.get(id=created['ruleId'])
        self.assertEqual((rule.tenant_id, rule.action), (TENANT, 'warn'))

        updated = self.gql(UPDATE, input={'id': str(rule.id), 'action': 'block', 'blockLevel': 'turn'})
        self.assertTrue(updated['data']['updateContentRule']['success'], updated)
        rule.refresh_from_db()
        self.assertEqual((rule.action, rule.block_level), ('block', 'turn'))
        # The pre-#396 field still works for clients that send it.
        legacy = self.gql(UPDATE, input={'id': str(rule.id), 'enforcement': 'log_only'})
        self.assertTrue(legacy['data']['updateContentRule']['success'], legacy)
        rule.refresh_from_db()
        self.assertEqual(rule.action, 'log')

        toggled = self.gql(TOGGLE, id=str(rule.id), enabled=False)
        self.assertTrue(toggled['data']['toggleContentRuleEnabled']['success'], toggled)
        rule.refresh_from_db()
        self.assertFalse(rule.enabled)

        copy = self.gql(DUPLICATE, id=str(rule.id), newName='Tickets again')['data']['duplicateContentRule']
        self.assertTrue(copy['success'], copy)
        duplicate = ContentRule.objects.get(id=copy['ruleId'])
        self.assertEqual((duplicate.name, duplicate.tenant_id, duplicate.action), ('Tickets again', TENANT, 'log'))

        tested = self.gql(TEST, id=str(rule.id), content='see PROJ-12')['data']['testContentRule']
        self.assertEqual((tested['success'], tested['matched']), (True, True))

        self.assertTrue(self.gql(DELETE, id=str(rule.id))['data']['deleteContentRule']['success'])
        self.assertFalse(ContentRule.objects.filter(id=rule.id).exists())

    def test_another_tenants_rule_is_not_found(self):
        theirs = ContentRule.objects.create(tenant_id='other-tenant', name='Theirs', rule_type='custom_pattern',
                                            action='block')
        for query, variables, field in (
                (UPDATE, {'input': {'id': str(theirs.id), 'action': 'log'}}, 'updateContentRule'),
                (DUPLICATE, {'id': str(theirs.id)}, 'duplicateContentRule'),
                (TEST, {'id': str(theirs.id), 'content': 'x'}, 'testContentRule'),
                (DELETE, {'id': str(theirs.id)}, 'deleteContentRule')):
            with self.subTest(field=field):
                self.assertEqual(self.gql(query, **variables)['data'][field]['errors'], ['Rule not found'])
        toggled = self.gql(TOGGLE, id=str(theirs.id), enabled=False)
        self.assertEqual(toggled['errors'][0]['message'], 'Rule not found')
        theirs.refresh_from_db()
        self.assertEqual((theirs.action, theirs.enabled), ('block', True))
        self.assertEqual(ContentRule.objects.count(), 1)

        endpoint = AgentEndpoint.objects.create(tenant_id='other-tenant', agent_id='theirs', name='theirs')
        pinned = self.gql(CREATE, input={'name': 'Pin', 'ruleType': 'custom_pattern', 'scopeType': 'endpoint',
                                         'scopeEndpointId': str(endpoint.id)})['data']['createContentRule']
        self.assertEqual((pinned['success'], pinned['errors']), (False, ['Endpoint not found']))

    def test_a_viewer_cannot_write_rules(self):
        viewer = self.portal('rules-viewer', ROLE_VIEWER)
        denied = self.gql(CREATE, client=viewer, input={'name': 'X', 'ruleType': 'custom_pattern'})
        self.assertEqual(denied['errors'][0]['extensions']['code'], 'FORBIDDEN')
        self.assertFalse(ContentRule.objects.exists())

    def test_an_invalid_action_is_refused_with_the_reason(self):
        steer = self.gql(CREATE, input={'name': 'Steer', 'ruleType': 'custom_pattern', 'action': 'steer'})
        self.assertEqual(steer['data']['createContentRule']['errors'],
                         ['a rule that can steer needs a steer message'])
        legacy = self.gql(CREATE, input={'name': 'Legacy', 'ruleType': 'custom_pattern', 'enforcement': 'shout'})
        self.assertEqual(legacy['data']['createContentRule']['errors'], ['Invalid enforcement: shout'])
        self.assertFalse(ContentRule.objects.exists())
