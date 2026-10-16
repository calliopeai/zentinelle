"""Gemini requests carry their output cap in generationConfig (audit H7).

The gateway sends the Gemini request body as request_body. Reading only the
OpenAI and Anthropic field names left max_output_tokens empty, so every Gemini
call under a hard budget was denied.
"""
import json
from decimal import Decimal
from unittest import mock

from django.test import SimpleTestCase

from zentinelle.services.budgets import request_upper_bound
from zentinelle.services.evaluation_context import normalize_context


def gemini_context(generation_config):
    body = {'contents': [{'role': 'user', 'parts': [{'text': 'hi'}]}]}
    if generation_config is not None:
        body['generationConfig'] = generation_config
    # The shape the gateway sends: model from the URL path, body as text.
    return normalize_context({
        'provider': 'google', 'model': 'gemini-2.5-pro',
        'request_body': json.dumps(body), 'request_id': 'r',
    })


class GeminiMaxOutputTokensTests(SimpleTestCase):
    def test_max_output_tokens_is_read(self):
        self.assertEqual(gemini_context({'maxOutputTokens': 256})['max_output_tokens'], 256)

    def test_snake_case_is_read(self):
        self.assertEqual(gemini_context({'max_output_tokens': 64})['max_output_tokens'], 64)

    def test_candidate_count_multiplies_the_bound(self):
        ctx = gemini_context({'maxOutputTokens': 256, 'candidateCount': 3})
        self.assertEqual(ctx['max_output_tokens'], 768)

    def test_no_or_invalid_cap_stays_unbounded(self):
        for config in (None, {}, {'maxOutputTokens': 0}, {'maxOutputTokens': '256'},
                       {'maxOutputTokens': True}, {'maxOutputTokens': 256, 'candidateCount': 0}):
            with self.subTest(config=config):
                self.assertIsNone(gemini_context(config)['max_output_tokens'])

    def test_openai_field_still_wins(self):
        body = {'model': 'gpt-4o', 'max_tokens': 100, 'generationConfig': {'maxOutputTokens': 9}}
        ctx = normalize_context({'provider': 'openai', 'request_body': json.dumps(body)})
        self.assertEqual(ctx['max_output_tokens'], 100)

    def test_hard_budget_can_bound_a_gemini_request(self):
        price = {'input': Decimal('1.25'), 'output': Decimal('10.00')}
        with mock.patch('zentinelle.services.usage_tracking.resolve_model_pricing', return_value=price):
            bound = request_upper_bound(gemini_context({'maxOutputTokens': 256}))
        # 256 output tokens at $10/M alone is $0.00256.
        self.assertGreaterEqual(bound, Decimal('0.00256'))

    def test_hard_budget_still_refuses_an_uncapped_gemini_request(self):
        price = {'input': Decimal('1.25'), 'output': Decimal('10.00')}
        with mock.patch('zentinelle.services.usage_tracking.resolve_model_pricing', return_value=price):
            with self.assertRaises(ValueError):
                request_upper_bound(gemini_context(None))

    def test_generation_config_is_no_bound_for_other_providers(self):
        body = {'model': 'gpt-4o', 'messages': [], 'generationConfig': {'maxOutputTokens': 1}}
        for provider in ('openai', 'anthropic', ''):
            with self.subTest(provider=provider):
                ctx = normalize_context({'provider': provider, 'request_body': json.dumps(body)})
                self.assertIsNone(ctx['max_output_tokens'])
