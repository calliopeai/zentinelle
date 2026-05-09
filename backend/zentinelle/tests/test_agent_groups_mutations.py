"""
Tests for AgentGroup GraphQL mutations.

Covers: createAgentGroup, updateAgentGroup, deleteAgentGroup, assignAgentToGroup.

Tested through the wired Strawberry schema (``zentinelle.schema.schema``)
so the schema-arity bugs (e.g. parameter renames between schema and
implementation) would surface here.
"""
from django.test import TestCase

from zentinelle.models.agent_group import AgentGroup
from zentinelle.models.endpoint import AgentEndpoint
from zentinelle.schema import schema
from zentinelle.tests._graphql_helpers import (
    STANDALONE_TENANT,
    admin_context,
)


CREATE_GROUP = """
mutation Create($name: String!, $description: String!, $tier: String!, $color: String!) {
  createAgentGroup(name: $name, description: $description, tier: $tier, color: $color) {
    errors
    group { id name slug tier color description }
  }
}
"""

UPDATE_GROUP = """
mutation Update($id: ID!, $name: String, $tier: String, $color: String, $description: String) {
  updateAgentGroup(id: $id, name: $name, tier: $tier, color: $color, description: $description) {
    errors
    group { id name tier color description }
  }
}
"""

DELETE_GROUP = """
mutation Delete($id: ID!) {
  deleteAgentGroup(id: $id) {
    success
    errors
  }
}
"""

ASSIGN_AGENT = """
mutation Assign($agentId: ID!, $groupId: ID!) {
  assignAgentToGroup(agentId: $agentId, groupId: $groupId) {
    success
    errors
  }
}
"""


def _exec(query, variables=None, context=None):
    return schema.execute_sync(
        query,
        variable_values=variables or {},
        context_value=context or admin_context(),
    )


class CreateAgentGroupTests(TestCase):

    def test_create_happy_path(self):
        result = _exec(CREATE_GROUP, {
            'name': 'Engineering',
            'description': 'Engineering team agents',
            'tier': 'standard',
            'color': '#6366f1',
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['createAgentGroup']
        self.assertEqual(payload['errors'], [])
        self.assertEqual(payload['group']['name'], 'Engineering')
        self.assertEqual(payload['group']['slug'], 'engineering')
        self.assertEqual(payload['group']['tier'], 'standard')

        # Persisted to the DB with the request tenant_id
        group = AgentGroup.objects.get(name='Engineering')
        self.assertEqual(group.tenant_id, STANDALONE_TENANT)
        self.assertEqual(group.color, '#6366f1')

    def test_slug_collision_appends_counter(self):
        AgentGroup.objects.create(
            tenant_id=STANDALONE_TENANT, name='Existing',
            slug='existing', tier='standard', color='brand',
        )
        result = _exec(CREATE_GROUP, {
            'name': 'Existing', 'description': '', 'tier': 'standard', 'color': 'brand',
        })
        self.assertIsNone(result.errors)
        slug = result.data['createAgentGroup']['group']['slug']
        # Should not be a duplicate of the existing slug
        self.assertNotEqual(slug, 'existing')
        self.assertTrue(slug.startswith('existing-'))


class UpdateAgentGroupTests(TestCase):

    def setUp(self):
        self.group = AgentGroup.objects.create(
            tenant_id=STANDALONE_TENANT, name='Original',
            slug='original', tier='standard', color='brand',
            description='before',
        )

    def test_update_happy_path(self):
        result = _exec(UPDATE_GROUP, {
            'id': str(self.group.id),
            'name': 'Renamed',
            'tier': 'restricted',
            'color': '#ff0000',
            'description': 'after',
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['updateAgentGroup']
        self.assertEqual(payload['errors'], [])
        self.assertEqual(payload['group']['name'], 'Renamed')

        self.group.refresh_from_db()
        self.assertEqual(self.group.name, 'Renamed')
        self.assertEqual(self.group.tier, 'restricted')
        self.assertEqual(self.group.color, '#ff0000')
        self.assertEqual(self.group.description, 'after')

    def test_update_partial_keeps_other_fields(self):
        result = _exec(UPDATE_GROUP, {
            'id': str(self.group.id),
            'name': 'OnlyName',
        })
        self.assertIsNone(result.errors)
        self.group.refresh_from_db()
        self.assertEqual(self.group.name, 'OnlyName')
        # Untouched fields remain
        self.assertEqual(self.group.tier, 'standard')
        self.assertEqual(self.group.color, 'brand')

    def test_update_other_tenant_returns_not_found(self):
        # Group belongs to a different tenant
        other = AgentGroup.objects.create(
            tenant_id='other-tenant', name='Other',
            slug='other', tier='standard', color='brand',
        )
        result = _exec(UPDATE_GROUP, {
            'id': str(other.id), 'name': 'Hijacked',
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateAgentGroup']
        self.assertIn('Group not found', payload['errors'])

        # The other-tenant group is NOT touched
        other.refresh_from_db()
        self.assertEqual(other.name, 'Other')

    def test_update_nonexistent_returns_not_found(self):
        result = _exec(UPDATE_GROUP, {
            'id': '00000000-0000-0000-0000-000000000999',
            'name': 'NoOp',
        })
        self.assertIsNone(result.errors)
        self.assertIn('Group not found', result.data['updateAgentGroup']['errors'])


class DeleteAgentGroupTests(TestCase):

    def test_delete_happy_path(self):
        group = AgentGroup.objects.create(
            tenant_id=STANDALONE_TENANT, name='ToDelete',
            slug='to-delete', tier='standard', color='brand',
        )
        result = _exec(DELETE_GROUP, {'id': str(group.id)})
        self.assertIsNone(result.errors)
        self.assertTrue(result.data['deleteAgentGroup']['success'])
        self.assertFalse(AgentGroup.objects.filter(id=group.id).exists())

    def test_delete_other_tenant_isolation(self):
        other = AgentGroup.objects.create(
            tenant_id='other-tenant', name='ProtectedOther',
            slug='protected-other', tier='standard', color='brand',
        )
        result = _exec(DELETE_GROUP, {'id': str(other.id)})
        self.assertIsNone(result.errors)
        payload = result.data['deleteAgentGroup']
        self.assertFalse(payload['success'])
        self.assertIn('Group not found', payload['errors'])
        # And it's still there
        self.assertTrue(AgentGroup.objects.filter(id=other.id).exists())

    def test_delete_nonexistent(self):
        result = _exec(DELETE_GROUP, {
            'id': '00000000-0000-0000-0000-000000000abc'.replace('a', '1'),
        })
        # Either errors out or returns success=False — accept the latter
        if result.errors:
            self.fail(f"Unexpected GraphQL errors: {result.errors}")
        self.assertFalse(result.data['deleteAgentGroup']['success'])


class AssignAgentToGroupTests(TestCase):

    def setUp(self):
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='agent-001', name='Agent 1',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash, api_key_prefix=key_prefix,
        )
        self.group = AgentGroup.objects.create(
            tenant_id=STANDALONE_TENANT, name='Target', slug='target',
            tier='standard', color='brand',
        )

    def test_assign_happy_path(self):
        result = _exec(ASSIGN_AGENT, {
            'agentId': str(self.endpoint.id),
            'groupId': str(self.group.id),
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        self.assertTrue(result.data['assignAgentToGroup']['success'])

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.group_id, self.group.id)

    def test_assign_unknown_agent(self):
        result = _exec(ASSIGN_AGENT, {
            'agentId': '00000000-0000-0000-0000-000000000999',
            'groupId': str(self.group.id),
        })
        self.assertIsNone(result.errors)
        payload = result.data['assignAgentToGroup']
        self.assertFalse(payload['success'])
        self.assertIn('Agent not found', payload['errors'])

    def test_assign_unknown_group(self):
        result = _exec(ASSIGN_AGENT, {
            'agentId': str(self.endpoint.id),
            'groupId': '00000000-0000-0000-0000-000000000999',
        })
        self.assertIsNone(result.errors)
        payload = result.data['assignAgentToGroup']
        self.assertFalse(payload['success'])
        self.assertIn('Group not found', payload['errors'])

        # Endpoint group remains unset
        self.endpoint.refresh_from_db()
        self.assertIsNone(self.endpoint.group_id)

    def test_assign_other_tenants_agent_isolation(self):
        # Agent owned by another tenant — must not be reachable
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        other_agent = AgentEndpoint.objects.create(
            tenant_id='other-tenant',
            agent_id='other-agent', name='Other',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash, api_key_prefix=key_prefix,
        )
        result = _exec(ASSIGN_AGENT, {
            'agentId': str(other_agent.id),
            'groupId': str(self.group.id),
        })
        self.assertIsNone(result.errors)
        payload = result.data['assignAgentToGroup']
        self.assertFalse(payload['success'])
        self.assertIn('Agent not found', payload['errors'])

    def test_assign_other_tenants_group_isolation(self):
        other_group = AgentGroup.objects.create(
            tenant_id='other-tenant', name='OtherGroup',
            slug='other-group', tier='standard', color='brand',
        )
        result = _exec(ASSIGN_AGENT, {
            'agentId': str(self.endpoint.id),
            'groupId': str(other_group.id),
        })
        self.assertIsNone(result.errors)
        payload = result.data['assignAgentToGroup']
        self.assertFalse(payload['success'])
        self.assertIn('Group not found', payload['errors'])
