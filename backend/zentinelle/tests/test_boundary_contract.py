from types import SimpleNamespace

from django.test import SimpleTestCase

from zentinelle.services.boundary_contract import build_contract, canonical_action


class BoundaryContractTests(SimpleTestCase):
    def setUp(self):
        self.endpoint = SimpleNamespace(tenant_id='tenant-a', id='endpoint-1', agent_id='worker')

    def test_native_and_mcp_aliases_share_canonical_shape(self):
        native = build_contract(endpoint=self.endpoint, action='tool.invoke', context={'tool': 'search'})
        mcp = build_contract(endpoint=self.endpoint, action='mcp.tool_call', context={'tool': 'search'})
        self.assertEqual(native['contract_version'], '1')
        self.assertEqual(native['action'], mcp['action'])
        self.assertEqual(native['resource'], {'type': 'tool', 'id': 'search'})
        self.assertEqual(native['subject'], mcp['subject'])

    def test_missing_action_or_identity_is_rejected(self):
        with self.assertRaises(ValueError):
            canonical_action('')
        with self.assertRaises(ValueError):
            build_contract(endpoint=SimpleNamespace(tenant_id='', id=None, agent_id='x'), action='llm:invoke')
