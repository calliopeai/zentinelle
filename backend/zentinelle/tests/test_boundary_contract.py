from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from zentinelle.services.boundary_contract import build_contract, canonical_action, evaluate_boundary


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

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_adapter_evaluation_canonicalizes_and_carries_trace(self, evaluate):
        from zentinelle.services.policy_engine import EvaluationResult
        evaluate.return_value = EvaluationResult(allowed=True, coverage={'status': 'enforced'})
        result = evaluate_boundary(endpoint=self.endpoint, action='mcp.tool_call', context={'tool': 'search'})
        self.assertTrue(result['allowed'])
        self.assertEqual(result['action'], 'tool_call')
        self.assertEqual(evaluate.call_args.kwargs['action'], 'tool_call')
        self.assertEqual(result['context']['trace_id'], result['trace_id'])

    def test_adapter_evaluation_fails_closed_on_malformed_context(self):
        result = evaluate_boundary(endpoint=self.endpoint, action='retrieval', context=['untrusted'])
        self.assertFalse(result['allowed'])
        self.assertEqual(result['decision'], 'deny')
