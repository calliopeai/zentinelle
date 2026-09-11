from unittest.mock import patch

from django.test import TestCase

from zentinelle.models import Policy
from zentinelle.models import AgentEndpoint
from zentinelle.services.llm_provider import _check_tool_route


class ToolRouteAuthorityTests(TestCase):
    def test_required_approval_is_carried_into_pre_execution_policy_check(self):
        Policy.objects.create(
            tenant_id='tenant-a', name='Sensitive tools', policy_type='tool_permission',
            config={'requires_approval': ['send_email']}, scope_type='organization',
            enforcement='enforce', enabled=True,
        )
        with patch('zentinelle.services.approvals.validate_policy_approval', return_value=type('R', (), {'passed': True})()) as validate:
            _check_tool_route('send_email', {'to': 'user@example.test'}, 'tenant-a', approval_token='approval-1', user_id='operator-1')
        self.assertEqual(validate.call_args.args[2], 'operator-1')
        self.assertEqual(validate.call_args.args[3]['approval_token'], 'approval-1')

    def test_endpoint_context_resolves_scoped_tool_policy(self):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        endpoint = AgentEndpoint.objects.create(tenant_id='tenant-a', agent_id='scoped-tool', name='Scoped',
                                                 api_key_hash=key_hash, api_key_prefix=prefix,
                                                 sub_organization_id_ext='team-a')
        Policy.objects.create(tenant_id='tenant-a', name='Team deny', policy_type='tool_permission',
                              config={'denied_tools': ['send_email']}, scope_type='sub_organization',
                              scope_sub_organization_id_ext='team-a', enforcement='enforce', enabled=True)
        with self.assertRaisesRegex(RuntimeError, 'denied'):
            _check_tool_route('send_email', {}, 'tenant-a', endpoint_id=str(endpoint.id))
