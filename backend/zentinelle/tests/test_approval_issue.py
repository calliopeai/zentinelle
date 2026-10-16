"""An approval issued through POST /approvals matches the agent's /evaluate retry (#383).

/evaluate fills in resource_type and resource_id before the engine digests the
context, so the issuing view has to digest the same fields. These go through
both endpoints, which the direct PolicyEngine tests never did.
"""
from django.urls import reverse

from zentinelle.auth.roles import ROLE_OPERATOR
from zentinelle.models import AgentEndpoint
from zentinelle.tests.test_agent_host import AgentHostTestCase


class ApprovalIssueMatchesEvaluateTests(AgentHostTestCase):
    def setUp(self):
        self.agent, self.agent_key = self.make_endpoint('claude-dev', AgentEndpoint.AgentType.CLAUDE_CODE)
        self.require_approval_for('search')
        self.operator = self.as_portal('operator', ROLE_OPERATOR)

    def issue(self, action, context):
        response = self.operator.post(reverse('zentinelle:approval-issue'), {
            'agent_id': 'claude-dev', 'user_id': 'user-1', 'action': action, 'context': context,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()['approval_token']

    def retry(self, token, action='tool_call', **context):
        return self.evaluate({'action': action, 'user_id': 'user-1',
                              'context': {'tool': 'search', 'approval_token': token, **context}},
                             key=self.agent_key).json()

    def test_without_an_approval_the_call_is_denied(self):
        result = self.evaluate({'action': 'tool_call', 'user_id': 'user-1', 'context': {'tool': 'search'}},
                               key=self.agent_key).json()

        self.assertEqual(result['decision'], 'deny')

    def test_an_approval_for_the_context_the_agent_sends_allows_its_retry(self):
        token = self.issue('tool_call', {'tool': 'search'})

        self.assertEqual(self.retry(token)['decision'], 'allow')

    def test_an_approval_issued_under_an_action_alias_matches_the_canonical_evaluation(self):
        token = self.issue('tool.invoke', {'tool': 'search'})

        self.assertEqual(self.retry(token, action='mcp.tool_call')['decision'], 'allow')

    def test_explicit_resource_fields_still_bind_the_approval(self):
        token = self.issue('tool_call', {'tool': 'search', 'resource_id': 'other-tool'})

        self.assertEqual(self.retry(token)['decision'], 'deny')
        self.assertEqual(self.retry(token, resource_id='other-tool')['decision'], 'allow')

    def test_an_approval_for_another_tool_does_not_match(self):
        token = self.issue('tool_call', {'tool': 'fetch'})

        self.assertEqual(self.retry(token)['decision'], 'deny')
