"""
Tests for SystemPrompt GraphQL mutations wired in this session.

Covers: forkSystemPrompt, analyzeSystemPrompt.

analyzeSystemPrompt calls out to an LLM via the prompt_tester service. We
mock that service to keep tests fast, deterministic, and free of network
calls.
"""
from unittest.mock import patch

from django.test import TestCase

from zentinelle.models.system_prompt import SystemPrompt
from zentinelle.schema import schema
from zentinelle.services.prompt_tester import (
    ImprovementSuggestion,
    PromptAnalysis,
)
from zentinelle.tests._graphql_helpers import (
    admin_context,
    anon_context,
)


FORK_PROMPT = """
mutation Fork($id: ID!) {
  forkSystemPrompt(id: $id) {
    success
    errors
    prompt { id name slug status visibility }
  }
}
"""

ANALYZE_PROMPT = """
mutation Analyze($promptText: String!, $promptType: String!, $targetProviders: [String!]) {
  analyzeSystemPrompt(
    promptText: $promptText, promptType: $promptType, targetProviders: $targetProviders
  ) {
    success
    error
    overallScore
    strengths
    tokenEfficiency
    improvements { category originalText suggestedText explanation severity }
  }
}
"""


def _exec(query, variables=None, context=None):
    return schema.execute_sync(
        query,
        variable_values=variables or {},
        context_value=context or admin_context(),
    )


def _make_prompt(name='Sample Prompt', slug='sample-prompt', user_id='1'):
    return SystemPrompt.objects.create(
        name=name,
        slug=slug,
        prompt_text='You are a helpful assistant. Use {{topic}} in answers.',
        prompt_type='system',
        user_id=user_id,
        status='active',
        visibility='public',
        compatible_providers=['openai'],
        compatible_models=['gpt-4'],
        use_cases=['general'],
    )


class ForkSystemPromptTests(TestCase):

    def setUp(self):
        # The admin context user has pk=1 (matches user_id='1' on the prompt)
        self.original = _make_prompt()

    def test_fork_creates_new_prompt(self):
        result = _exec(FORK_PROMPT, {'id': str(self.original.id)})
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['forkSystemPrompt']
        self.assertTrue(payload['success'])
        self.assertIsNotNone(payload['prompt'])

        # New prompt is a distinct row
        new_id = payload['prompt']['id']
        self.assertNotEqual(new_id, str(self.original.id))

        # The fork carries name suffix and starts in draft/private
        self.assertEqual(payload['prompt']['name'], 'Sample Prompt (Fork)')
        self.assertEqual(payload['prompt']['status'], 'draft')
        self.assertEqual(payload['prompt']['visibility'], 'private')

    def test_fork_links_parent_and_increments_count(self):
        before = self.original.fork_count
        _exec(FORK_PROMPT, {'id': str(self.original.id)})

        self.original.refresh_from_db()
        self.assertEqual(self.original.fork_count, before + 1)

        # Forked prompt has parent set
        forked = SystemPrompt.objects.exclude(id=self.original.id).get()
        self.assertEqual(forked.parent_prompt_id, self.original.id)

    def test_fork_copies_content(self):
        _exec(FORK_PROMPT, {'id': str(self.original.id)})
        forked = SystemPrompt.objects.exclude(id=self.original.id).get()

        self.assertEqual(forked.prompt_text, self.original.prompt_text)
        self.assertEqual(forked.prompt_type, self.original.prompt_type)
        self.assertEqual(
            sorted(forked.compatible_providers),
            sorted(self.original.compatible_providers),
        )

    def test_fork_unknown_returns_error(self):
        result = _exec(FORK_PROMPT, {'id': '00000000-0000-0000-0000-000000000999'})
        self.assertIsNone(result.errors)
        payload = result.data['forkSystemPrompt']
        self.assertFalse(payload['success'])
        self.assertIn('Prompt not found', payload['errors'])

    def test_fork_unauthenticated_rejected(self):
        result = _exec(
            FORK_PROMPT,
            {'id': str(self.original.id)},
            context=anon_context(),
        )
        self.assertIsNone(result.errors)
        payload = result.data['forkSystemPrompt']
        self.assertFalse(payload['success'])
        self.assertIn('Authentication required', payload['errors'])

        # No fork created
        self.assertEqual(SystemPrompt.objects.count(), 1)


class AnalyzeSystemPromptTests(TestCase):
    """
    These tests mock zentinelle.services.prompt_tester.analyze_prompt_sync
    rather than hitting OpenAI. The mutation just shapes the result into
    GraphQL — these tests verify that shaping is correct.
    """

    def test_analyze_returns_payload_from_service(self):
        fake = PromptAnalysis(
            success=True,
            overall_score=82,
            strengths=['Clear role', 'Specific output format'],
            improvements=[
                ImprovementSuggestion(
                    category='clarity',
                    original_text='You are helpful',
                    suggested_text='You are a helpful technical writing assistant',
                    explanation='Be specific about the role',
                    severity='warning',
                ),
            ],
            token_efficiency='optimal',
        )
        with patch(
            'zentinelle.services.prompt_tester.analyze_prompt_sync',
            return_value=fake,
        ) as mock_analyze:
            result = _exec(ANALYZE_PROMPT, {
                'promptText': 'You are helpful',
                'promptType': 'system',
                'targetProviders': ['openai'],
            })

        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['analyzeSystemPrompt']
        self.assertTrue(payload['success'])
        self.assertEqual(payload['overallScore'], 82)
        self.assertEqual(payload['tokenEfficiency'], 'optimal')
        self.assertEqual(payload['strengths'], ['Clear role', 'Specific output format'])
        self.assertEqual(len(payload['improvements']), 1)
        self.assertEqual(payload['improvements'][0]['category'], 'clarity')
        self.assertEqual(payload['improvements'][0]['severity'], 'warning')

        # And we passed the right args through to the service
        self.assertEqual(mock_analyze.call_count, 1)
        kwargs = mock_analyze.call_args.kwargs
        self.assertEqual(kwargs['prompt_text'], 'You are helpful')
        self.assertEqual(kwargs['prompt_type'], 'system')
        self.assertEqual(kwargs['target_providers'], ['openai'])

    def test_analyze_propagates_service_error(self):
        fake = PromptAnalysis(
            success=False, overall_score=0,
            strengths=[], improvements=[], token_efficiency='',
            error='Rate limit exceeded',
        )
        with patch(
            'zentinelle.services.prompt_tester.analyze_prompt_sync',
            return_value=fake,
        ):
            result = _exec(ANALYZE_PROMPT, {
                'promptText': 'You are helpful',
                'promptType': 'system',
                'targetProviders': None,
            })

        self.assertIsNone(result.errors)
        payload = result.data['analyzeSystemPrompt']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Rate limit exceeded')
        self.assertEqual(payload['overallScore'], 0)

    def test_analyze_unauthenticated_rejected(self):
        # Should not even hit the service
        with patch(
            'zentinelle.services.prompt_tester.analyze_prompt_sync',
        ) as mock_analyze:
            result = _exec(
                ANALYZE_PROMPT,
                {
                    'promptText': 'You are helpful',
                    'promptType': 'system',
                    'targetProviders': None,
                },
                context=anon_context(),
            )

        self.assertIsNone(result.errors)
        payload = result.data['analyzeSystemPrompt']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Authentication required')
        mock_analyze.assert_not_called()
