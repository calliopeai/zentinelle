from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from zentinelle.services.llm_provider import _check_model_route


class ModelRouteGuardTests(SimpleTestCase):
    @patch('zentinelle.models.AIModel')
    def test_disabled_registered_model_is_rejected(self, model):
        model.objects.filter.return_value.first.return_value = SimpleNamespace(
            is_available=True, deprecated=False, enabled_for_chat=False,
        )
        with self.assertRaisesRegex(RuntimeError, 'Model route is disabled'):
            _check_model_route('gpt-test', 'openai')

    @patch('zentinelle.models.AIModel')
    def test_unregistered_model_is_left_to_live_discovery(self, model):
        model.objects.filter.return_value.first.return_value = None
        _check_model_route('new-model', 'openai')

    @patch('zentinelle.models.OrganizationModelApproval')
    @patch('zentinelle.models.AIModel')
    def test_tenant_denial_is_rejected(self, model, approvals):
        registered = SimpleNamespace(is_available=True, deprecated=False, enabled_for_chat=True)
        model.objects.filter.return_value.first.return_value = registered
        approval = SimpleNamespace(is_usable=False)
        approvals.objects.filter.return_value.first.return_value = approval
        with self.assertRaisesRegex(RuntimeError, 'not approved for tenant'):
            _check_model_route('gpt-test', 'openai', 'tenant-a')

    @patch('zentinelle.models.Policy')
    @patch('zentinelle.models.AIModel')
    def test_tenant_model_restriction_is_enforced_before_provider_access(self, model, policies):
        model.objects.filter.return_value.first.return_value = None
        policy = SimpleNamespace(
            id='policy-models', config={'allowed_models': ['approved-model']},
        )
        policies.objects.filter.return_value.order_by.return_value = [policy]
        with self.assertRaisesRegex(RuntimeError, 'denied by policy'):
            _check_model_route('blocked-model', 'openai', 'tenant-a')
