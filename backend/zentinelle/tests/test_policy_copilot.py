from django.test import SimpleTestCase
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch

from zentinelle.api.views.policy_copilot import PolicyCopilotDraftView
from zentinelle.auth.roles import ROLE_OPERATOR, assign_role
from zentinelle.models import Policy, PolicyChangeSet, TenantConfig


class PolicyCopilotDraftInferenceTests(SimpleTestCase):
    def test_reviewed_natural_language_intents_produce_structured_drafts(self):
        policy_type, config = PolicyCopilotDraftView._infer_draft('restrict model gpt-5')
        self.assertEqual(policy_type, 'model_restriction')
        self.assertEqual(config['allowed_models'], ['gpt-5'])
        policy_type, config = PolicyCopilotDraftView._infer_draft('block tool web_search')
        self.assertEqual(policy_type, 'tool_permission')
        self.assertIn('review_required', config)

    def test_ambiguous_prompt_is_not_authorized(self):
        self.assertEqual(PolicyCopilotDraftView._infer_draft('do something useful'), (None, None))


class PolicyCopilotDiffAPITests(TestCase):
    def test_diff_is_tenant_scoped_and_non_mutating(self):
        user = get_user_model().objects.create_user('copilot-operator')
        assign_role(user, ROLE_OPERATOR)
        TenantConfig.objects.create(tenant_id='tenant-a', settings={'policy_copilot_enabled': True})
        policy = Policy.objects.create(tenant_id='tenant-a', name='Current', policy_type='tool_permission', config={'denied_tools': []})
        client = APIClient()
        client.force_authenticate(user=user)
        with self.settings(AUTH_MODE='local'), patch('zentinelle.api.views.policy_copilot.get_request_tenant_id', return_value='tenant-a'):
            response = client.post('/api/zentinelle/v1/policy-copilot/diff', {
                'policy_id': str(policy.id),
                'draft': {'policy_type': 'tool_permission', 'scope_type': 'organization',
                          'enforcement': 'enforce', 'config': {'denied_tools': ['web_search']}},
            }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('config', response.json()['changed_fields'])
        policy.refresh_from_db()
        self.assertEqual(policy.config, {'denied_tools': []})

    def test_stage_creates_normal_change_set_without_promoting_live_policy(self):
        user = get_user_model().objects.create_user('copilot-stager')
        assign_role(user, ROLE_OPERATOR)
        TenantConfig.objects.create(tenant_id='tenant-stage', settings={'policy_copilot_enabled': True})
        client = APIClient()
        client.force_authenticate(user=user)
        with patch('zentinelle.api.views.policy_copilot.get_request_tenant_id', return_value='tenant-stage'):
            response = client.post('/api/zentinelle/v1/policy-copilot/stage', {
                'draft': {'policy_type': 'tool_permission', 'config': {'denied_tools': ['shell']}},
            }, format='json')
        self.assertEqual(response.status_code, 201)
        change = PolicyChangeSet.objects.get(id=response.json()['change_id'])
        self.assertEqual(change.status, PolicyChangeSet.Status.DRAFT)
        self.assertFalse(Policy.objects.filter(tenant_id='tenant-stage').exists())
