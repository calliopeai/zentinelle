from unittest.mock import patch

from django.test import TestCase

from zentinelle.models import Policy
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
