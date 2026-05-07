"""
Tests for zentinelle.services.model_sync.

Exercises the static known-model lists and classification helpers
without requiring API keys or database access.
"""
import unittest

from zentinelle.services.model_sync import (
    _openai_known_models,
    _anthropic_known_models,
    _google_known_models,
    _classify_openai_model,
    _openai_capabilities,
    _openai_pricing,
)
from zentinelle.models.model_registry import AIModel


class TestOpenAIKnownModels(unittest.TestCase):
    """_openai_known_models should return a list with pricing data."""

    def test_returns_non_empty_list(self):
        models = _openai_known_models()
        self.assertGreater(len(models), 0)

    def test_every_model_has_pricing(self):
        models = _openai_known_models()
        for m in models:
            self.assertIn('model_id', m)
            self.assertIsNotNone(m.get('input_price'),
                                 f"{m['model_id']} missing input_price")
            self.assertIsNotNone(m.get('output_price'),
                                 f"{m['model_id']} missing output_price")

    def test_gpt4o_present(self):
        models = _openai_known_models()
        ids = [m['model_id'] for m in models]
        self.assertIn('gpt-4o', ids)

    def test_context_window_set(self):
        models = _openai_known_models()
        for m in models:
            self.assertIsNotNone(m.get('context_window'),
                                 f"{m['model_id']} missing context_window")

    def test_capabilities_present(self):
        models = _openai_known_models()
        for m in models:
            caps = m.get('capabilities', [])
            self.assertIn('chat', caps,
                          f"{m['model_id']} missing 'chat' capability")


class TestAnthropicKnownModels(unittest.TestCase):
    """_anthropic_known_models should return current Anthropic models."""

    def test_returns_non_empty_list(self):
        models = _anthropic_known_models()
        self.assertGreater(len(models), 0)

    def test_model_type_is_llm(self):
        models = _anthropic_known_models()
        for m in models:
            self.assertEqual(m['model_type'], AIModel.ModelType.LLM)

    def test_claude_opus_present(self):
        models = _anthropic_known_models()
        ids = [m['model_id'] for m in models]
        opus_found = any('opus' in mid for mid in ids)
        self.assertTrue(opus_found, f"No Opus model found in {ids}")

    def test_pricing_positive(self):
        models = _anthropic_known_models()
        for m in models:
            self.assertGreater(m['input_price'], 0)
            self.assertGreater(m['output_price'], 0)

    def test_context_window_set(self):
        models = _anthropic_known_models()
        for m in models:
            self.assertIsNotNone(m.get('context_window'),
                                 f"{m['model_id']} missing context_window")
            self.assertGreater(m['context_window'], 0)


class TestGoogleKnownModels(unittest.TestCase):
    """_google_known_models should return current Google models."""

    def test_returns_non_empty_list(self):
        models = _google_known_models()
        self.assertGreater(len(models), 0)

    def test_gemini_model_present(self):
        models = _google_known_models()
        ids = [m['model_id'] for m in models]
        gemini_found = any('gemini' in mid for mid in ids)
        self.assertTrue(gemini_found, f"No Gemini model found in {ids}")

    def test_has_pricing(self):
        models = _google_known_models()
        for m in models:
            self.assertIsNotNone(m.get('input_price'),
                                 f"{m['model_id']} missing input_price")
            self.assertIsNotNone(m.get('output_price'),
                                 f"{m['model_id']} missing output_price")


class TestClassifyOpenAIModel(unittest.TestCase):
    """_classify_openai_model should return correct ModelType."""

    def test_embedding_model(self):
        self.assertEqual(
            _classify_openai_model('text-embedding-3-small'),
            AIModel.ModelType.EMBEDDING,
        )

    def test_image_model_dalle(self):
        self.assertEqual(
            _classify_openai_model('dall-e-3'),
            AIModel.ModelType.IMAGE_GEN,
        )

    def test_image_model_generic(self):
        self.assertEqual(
            _classify_openai_model('image-generator'),
            AIModel.ModelType.IMAGE_GEN,
        )

    def test_speech_model_tts(self):
        self.assertEqual(
            _classify_openai_model('tts-1'),
            AIModel.ModelType.SPEECH_TO_TEXT,
        )

    def test_speech_model_whisper(self):
        self.assertEqual(
            _classify_openai_model('whisper-1'),
            AIModel.ModelType.SPEECH_TO_TEXT,
        )

    def test_reasoning_model_o1(self):
        self.assertEqual(
            _classify_openai_model('o1'),
            AIModel.ModelType.REASONING,
        )

    def test_reasoning_model_o3(self):
        self.assertEqual(
            _classify_openai_model('o3-mini'),
            AIModel.ModelType.REASONING,
        )

    def test_default_is_llm(self):
        self.assertEqual(
            _classify_openai_model('gpt-4o'),
            AIModel.ModelType.LLM,
        )

    def test_unknown_model_is_llm(self):
        self.assertEqual(
            _classify_openai_model('some-new-model'),
            AIModel.ModelType.LLM,
        )


class TestOpenAICapabilities(unittest.TestCase):
    """_openai_capabilities should return correct capability lists."""

    def test_gpt4o_has_vision(self):
        caps = _openai_capabilities('gpt-4o')
        self.assertIn('chat', caps)
        self.assertIn('function_calling', caps)
        self.assertIn('vision', caps)

    def test_gpt4_turbo_has_vision(self):
        caps = _openai_capabilities('gpt-4-turbo')
        self.assertIn('vision', caps)
        self.assertIn('function_calling', caps)

    def test_o1_has_long_context(self):
        caps = _openai_capabilities('o1')
        self.assertIn('long_context', caps)
        self.assertIn('function_calling', caps)

    def test_o3_mini_has_long_context(self):
        caps = _openai_capabilities('o3-mini')
        self.assertIn('long_context', caps)

    def test_gpt4o_mini_has_function_calling(self):
        caps = _openai_capabilities('gpt-4o-mini')
        self.assertIn('function_calling', caps)

    def test_basic_model_has_chat(self):
        caps = _openai_capabilities('unknown-model')
        self.assertIn('chat', caps)
        # should NOT have function_calling
        self.assertNotIn('function_calling', caps)

    def test_chat_always_included(self):
        """Every model should have at least 'chat'."""
        for model_id in _openai_pricing().keys():
            caps = _openai_capabilities(model_id)
            self.assertIn('chat', caps, f"{model_id} missing 'chat'")
