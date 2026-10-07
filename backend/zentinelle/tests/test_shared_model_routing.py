"""Shared in-cluster model routing (calliope-installer#446).

The installer sets LMSTUDIO_URL, DEFAULT_LLM_PROVIDER=lmstudio and
ASSISTANT_MODEL for the shared vLLM. With all three, the served id goes to that
endpoint before any name heuristic, and Zentinelle's own prompt testing and
analysis calls use it. Without them, routing is exactly what it was.
"""
import asyncio
import os
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from zentinelle.services import prompt_tester
from zentinelle.services.llm_provider import detect_provider, shared_model_id

SHARED = {
    'LMSTUDIO_URL': 'http://shared-model.internal:8000',
    'DEFAULT_LLM_PROVIDER': 'lmstudio',
    'ASSISTANT_MODEL': 'meta-llama/Llama-3.1-8B-Instruct',
}

# What detect_provider returns with none of the variables set: today's routing.
TODAY = {
    'claude-sonnet-4-20250514': 'anthropic',
    'gpt-4o-mini': 'openai',
    'o3-mini': 'openai',
    'gemini-2.0-flash': 'google',
    'mistralai/Mistral-7B-Instruct-v0.3': 'mistral',
    'mixtral-8x7b': 'mistral',
    'command-r-plus': 'cohere',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B': 'deepseek',
    'meta-llama/Llama-3.1-8B-Instruct': 'together',
    'jamba-1.5-large': 'ai21',
    'Qwen/Qwen2.5-7B-Instruct': 'openai',
}


def env_without_model_vars():
    return {k: v for k, v in os.environ.items() if k not in SHARED}


class UnsetRoutingTests(SimpleTestCase):

    def test_unset_is_todays_routing(self):
        with patch.dict(os.environ, env_without_model_vars(), clear=True):
            self.assertEqual(shared_model_id(), '')
            self.assertEqual({m: detect_provider(m) for m in TODAY}, TODAY)

    def test_a_partial_configuration_changes_nothing(self):
        # A developer's local LM Studio, or an assistant model alone, is not
        # the shared model: the name heuristics still decide.
        partials = [
            {'LMSTUDIO_URL': SHARED['LMSTUDIO_URL'], 'ASSISTANT_MODEL': SHARED['ASSISTANT_MODEL']},
            {'ASSISTANT_MODEL': SHARED['ASSISTANT_MODEL'], 'DEFAULT_LLM_PROVIDER': 'lmstudio'},
            {**SHARED, 'DEFAULT_LLM_PROVIDER': 'openai'},
        ]
        for partial in partials:
            with self.subTest(partial=partial), \
                    patch.dict(os.environ, {**env_without_model_vars(), **partial}, clear=True):
                self.assertEqual(shared_model_id(), '')
                self.assertEqual(detect_provider(SHARED['ASSISTANT_MODEL']), 'together')


class SharedRoutingTests(SimpleTestCase):

    def test_the_served_id_wins_over_name_heuristics(self):
        for served in ('meta-llama/Llama-3.1-8B-Instruct',
                       'mistralai/Mistral-7B-Instruct-v0.3',
                       'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
                       'Qwen/Qwen2.5-7B-Instruct'):
            with self.subTest(served=served), \
                    patch.dict(os.environ, {**SHARED, 'ASSISTANT_MODEL': served}):
                self.assertEqual(detect_provider(served), 'lmstudio')

    def test_other_ids_keep_their_routing(self):
        with patch.dict(os.environ, SHARED):
            self.assertEqual(detect_provider('claude-sonnet-4-20250514'), 'anthropic')
            self.assertEqual(detect_provider('meta-llama/Llama-3.3-70B-Instruct'), 'together')
            # Unclaimed ids already fell through to DEFAULT_LLM_PROVIDER.
            self.assertEqual(detect_provider('Qwen/Qwen2.5-7B-Instruct'), 'lmstudio')


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


COMPLETION = {
    'choices': [{'message': {'content': '{"overall_score": 80, "strengths": [], "improvements": []}'}}],
    'usage': {'prompt_tokens': 3, 'completion_tokens': 5},
}


@override_settings(OPENAI_API_KEY='sk-openai-test')
@patch.object(prompt_tester, 'check_rate_limit', lambda *args: (True, 9))
class PromptTesterTests(SimpleTestCase):

    def run_calls(self):
        posts = []

        async def post(client, url, headers=None, json=None):
            posts.append((url, headers, json))
            return FakeResponse(COMPLETION)

        with patch('httpx.AsyncClient.post', post):
            tester = prompt_tester.PromptTester()
            tested = asyncio.run(tester.test_prompt(
                'You are a helpful assistant.', 'Hello there', 'user-1', model='gpt-4o'))
            analyzed = asyncio.run(tester.analyze_prompt('You are a helpful assistant.', 'user-1'))
        return posts, tested, analyzed

    def test_unset_calls_openai_as_today(self):
        with patch.dict(os.environ, env_without_model_vars(), clear=True):
            posts, tested, analyzed = self.run_calls()
        self.assertTrue(tested.success and analyzed.success)
        for url, headers, body in posts:
            self.assertEqual(url, 'https://api.openai.com/v1/chat/completions')
            self.assertEqual(headers['Authorization'], 'Bearer sk-openai-test')
            self.assertEqual(body['model'], 'gpt-4o-mini')

    def test_shared_model_serves_testing_and_analysis(self):
        lmstudio = {'base_url': 'http://shared-model.internal:8000/v1', 'env': None}
        with patch.dict(os.environ, SHARED), \
                patch.dict(prompt_tester.OPENAI_COMPAT_PROVIDERS, {'lmstudio': lmstudio}), \
                self.settings(OPENAI_API_KEY=''):
            posts, tested, analyzed = self.run_calls()
        self.assertTrue(tested.success and analyzed.success)
        self.assertEqual(tested.model_used, SHARED['ASSISTANT_MODEL'])
        self.assertEqual(len(posts), 2)
        for url, headers, body in posts:
            self.assertEqual(url, 'http://shared-model.internal:8000/v1/chat/completions')
            self.assertNotIn('Authorization', headers)
            self.assertEqual(body['model'], SHARED['ASSISTANT_MODEL'])
