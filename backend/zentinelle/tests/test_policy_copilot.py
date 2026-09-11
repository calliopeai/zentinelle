from django.test import SimpleTestCase

from zentinelle.api.views.policy_copilot import PolicyCopilotDraftView


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
