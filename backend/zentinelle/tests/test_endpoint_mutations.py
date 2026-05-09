"""
Tests for AgentEndpoint GraphQL mutations wired in this session.

Covers: updateAgentEndpoint, updateEndpointStatus.

Other endpoint mutations (create/delete/suspend/activate/regenerate) are
not in scope for this session — they predate the recent batch wiring.
"""
from django.test import TestCase

from zentinelle.models.endpoint import AgentEndpoint
from zentinelle.schema import schema
from zentinelle.tests._graphql_helpers import (
    STANDALONE_TENANT,
    admin_context,
    anon_context,
)


UPDATE_ENDPOINT = """
mutation UpdateEndpoint($input: UpdateAgentEndpointInput!) {
  updateAgentEndpoint(input: $input) {
    success
    error
    endpoint { id name agentType capabilities }
  }
}
"""

UPDATE_STATUS = """
mutation UpdateStatus($id: ID!, $status: String!) {
  updateEndpointStatus(id: $id, status: $status) {
    success
    error
    endpoint { id status }
  }
}
"""


def _exec(query, variables=None, context=None):
    return schema.execute_sync(
        query,
        variable_values=variables or {},
        context_value=context or admin_context(),
    )


class UpdateAgentEndpointTests(TestCase):

    def setUp(self):
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='ep-1', name='Original Name',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash, api_key_prefix=key_prefix,
            capabilities=['lab'], metadata={}, config={'v': 1},
        )

    def test_update_name_only(self):
        result = _exec(UPDATE_ENDPOINT, {
            'input': {'id': str(self.endpoint.id), 'name': 'New Name'},
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['updateAgentEndpoint']
        self.assertTrue(payload['success'])
        self.assertEqual(payload['endpoint']['name'], 'New Name')

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.name, 'New Name')
        # Untouched fields preserved
        self.assertEqual(self.endpoint.agent_type, AgentEndpoint.AgentType.CUSTOM)
        self.assertEqual(self.endpoint.capabilities, ['lab'])

    def test_update_multiple_fields(self):
        result = _exec(UPDATE_ENDPOINT, {
            'input': {
                'id': str(self.endpoint.id),
                'name': 'Renamed',
                'agentType': AgentEndpoint.AgentType.CLAUDE_CODE,
                'capabilities': ['lab', 'chat'],
                'config': {'v': 2, 'mode': 'strict'},
            },
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['updateAgentEndpoint']
        self.assertTrue(payload['success'], msg=payload.get('error'))

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.name, 'Renamed')
        self.assertEqual(self.endpoint.agent_type, 'claude_code')
        self.assertEqual(sorted(self.endpoint.capabilities), ['chat', 'lab'])
        self.assertEqual(self.endpoint.config, {'v': 2, 'mode': 'strict'})

    def test_update_invalid_agent_type_returns_error(self):
        result = _exec(UPDATE_ENDPOINT, {
            'input': {
                'id': str(self.endpoint.id),
                'agentType': 'not_a_real_type',
            },
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateAgentEndpoint']
        self.assertFalse(payload['success'])
        self.assertIn('Invalid agent type', payload['error'])

        # Endpoint untouched
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.agent_type, AgentEndpoint.AgentType.CUSTOM)

    def test_update_nonexistent_returns_error(self):
        result = _exec(UPDATE_ENDPOINT, {
            'input': {
                'id': '00000000-0000-0000-0000-000000000999',
                'name': 'Nope',
            },
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateAgentEndpoint']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Endpoint not found')

    def test_update_unauthenticated_rejected(self):
        result = _exec(
            UPDATE_ENDPOINT,
            {'input': {'id': str(self.endpoint.id), 'name': 'Hacked'}},
            context=anon_context(),
        )
        self.assertIsNone(result.errors)
        payload = result.data['updateAgentEndpoint']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Authentication required')

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.name, 'Original Name')


class UpdateEndpointStatusTests(TestCase):

    def setUp(self):
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='ep-2', name='Status Subject',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash, api_key_prefix=key_prefix,
            status=AgentEndpoint.Status.ACTIVE,
        )

    def test_update_status_to_suspended(self):
        result = _exec(UPDATE_STATUS, {
            'id': str(self.endpoint.id),
            'status': AgentEndpoint.Status.SUSPENDED,
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['updateEndpointStatus']
        self.assertTrue(payload['success'])
        self.assertEqual(payload['endpoint']['status'], 'suspended')

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.status, 'suspended')

    def test_update_status_invalid_value_rejected(self):
        result = _exec(UPDATE_STATUS, {
            'id': str(self.endpoint.id),
            'status': 'definitely_not_a_status',
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateEndpointStatus']
        self.assertFalse(payload['success'])
        self.assertIn('Invalid status', payload['error'])

        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.status, 'active')

    def test_update_status_nonexistent_returns_error(self):
        result = _exec(UPDATE_STATUS, {
            'id': '00000000-0000-0000-0000-000000000999',
            'status': AgentEndpoint.Status.SUSPENDED,
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateEndpointStatus']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Endpoint not found')

    def test_update_status_unauthenticated_rejected(self):
        result = _exec(
            UPDATE_STATUS,
            {'id': str(self.endpoint.id), 'status': AgentEndpoint.Status.SUSPENDED},
            context=anon_context(),
        )
        self.assertIsNone(result.errors)
        payload = result.data['updateEndpointStatus']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Authentication required')

    def test_status_round_trip(self):
        """Validate full status state machine: active -> suspended -> active."""
        for target in [
            AgentEndpoint.Status.SUSPENDED,
            AgentEndpoint.Status.ACTIVE,
            AgentEndpoint.Status.OFFLINE,
        ]:
            result = _exec(UPDATE_STATUS, {
                'id': str(self.endpoint.id),
                'status': target,
            })
            self.assertIsNone(result.errors)
            payload = result.data['updateEndpointStatus']
            self.assertTrue(payload['success'], msg=f"target={target}: {payload}")
            self.endpoint.refresh_from_db()
            self.assertEqual(self.endpoint.status, target)
