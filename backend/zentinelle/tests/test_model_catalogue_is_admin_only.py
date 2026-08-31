"""The shared model catalogue is not one tenant's to edit (#284).

`AIModel.enabled_for_chat` is install-wide: `assistant_providers` reads it to
decide which models every tenant may use. Both write endpoints accepted the
change from any authenticated caller, so one tenant could disable a model for
all of them — and in open mode, from anyone who could reach the port.

Not a `tenant_id` leak, which is why it is fixed here rather than in the
tenant-isolation work: the model genuinely is global. What was missing is the
role that editing global state should always have needed.
"""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from zentinelle.auth.roles import ROLE_ADMIN, ROLE_OPERATOR, assign_role
from zentinelle.models import AIModel
from zentinelle.models.ai_provider import AIProvider


class ModelCatalogueIsAdminOnlyTest(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(name='OpenAI', slug='openai')
        self.model = AIModel.objects.create(
            provider=self.provider,
            model_id='gpt-4o',
            name='GPT-4o',
            enabled_for_chat=True,
        )
        User = get_user_model()
        self.operator = User.objects.create_user('operator', password='x')
        assign_role(self.operator, ROLE_OPERATOR)
        self.admin = User.objects.create_user('an-admin', password='x')
        assign_role(self.admin, ROLE_ADMIN)

    def _toggle(self, enabled):
        return self.client.post(
            reverse('zentinelle:assistant-models-toggle'),
            data=json.dumps({'model_id': 'gpt-4o', 'enabled': enabled}),
            content_type='application/json',
        )

    @override_settings(AUTH_MODE='local')
    def test_a_non_admin_cannot_disable_a_model_for_everyone(self):
        self.client.force_login(self.operator)
        response = self._toggle(False)

        self.assertEqual(response.status_code, 403, response.content)
        self.model.refresh_from_db()
        self.assertTrue(
            self.model.enabled_for_chat,
            'a non-admin turned a model off for every tenant in the install',
        )

    @override_settings(AUTH_MODE='local')
    def test_an_admin_still_can(self):
        """The refusal has to be about the role, not about everyone."""
        self.client.force_login(self.admin)
        response = self._toggle(False)

        self.assertEqual(response.status_code, 200, response.content)
        self.model.refresh_from_db()
        self.assertFalse(self.model.enabled_for_chat)

    @override_settings(AUTH_MODE='local')
    def test_an_unauthenticated_caller_cannot(self):
        response = self._toggle(False)
        self.assertIn(response.status_code, (401, 403))
        self.model.refresh_from_db()
        self.assertTrue(self.model.enabled_for_chat)
