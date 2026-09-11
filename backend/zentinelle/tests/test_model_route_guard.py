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
