"""
Tests for zentinelle.services.multimodal_scanner.

Exercises Gemini and OpenAI multimodal request body parsing,
text extraction, and media detection.
"""
import base64
import unittest

from zentinelle.services.multimodal_scanner import (
    analyze_request_body,
    MultimodalAnalysis,
)


class TestGeminiTextAndImage(unittest.TestCase):
    """Gemini format with text + inline image data."""

    def test_detects_image_and_text(self):
        # 4 bytes of fake image data
        image_b64 = base64.b64encode(b'\x89PNG').decode()
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Describe this image.'},
                    {'inlineData': {
                        'mimeType': 'image/png',
                        'data': image_b64,
                    }},
                ],
            }],
        }
        result = analyze_request_body(body, provider='google')

        self.assertTrue(result.has_images)
        self.assertFalse(result.has_audio)
        self.assertEqual(result.image_count, 1)
        self.assertIn('Describe this image.', result.text_parts)
        self.assertEqual(result.total_media_bytes, 4)
        self.assertEqual(len(result.media_hashes), 1)

    def test_multiple_images(self):
        img1 = base64.b64encode(b'AAAA').decode()
        img2 = base64.b64encode(b'BBBB').decode()
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Compare these two images.'},
                    {'inlineData': {'mimeType': 'image/jpeg', 'data': img1}},
                    {'inlineData': {'mimeType': 'image/png', 'data': img2}},
                ],
            }],
        }
        result = analyze_request_body(body, provider='vertex')

        self.assertTrue(result.has_images)
        self.assertEqual(result.image_count, 2)
        self.assertEqual(result.total_media_bytes, 8)  # 4 + 4


class TestGeminiAudio(unittest.TestCase):
    """Gemini format with audio content."""

    def test_detects_audio(self):
        audio_b64 = base64.b64encode(b'\x00\x01\x02\x03' * 10).decode()
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Transcribe this audio.'},
                    {'inlineData': {
                        'mimeType': 'audio/mp3',
                        'data': audio_b64,
                    }},
                ],
            }],
        }
        result = analyze_request_body(body, provider='google')

        self.assertTrue(result.has_audio)
        self.assertEqual(result.audio_count, 1)
        self.assertFalse(result.has_images)
        self.assertEqual(result.total_media_bytes, 40)


class TestGeminiFileData(unittest.TestCase):
    """Gemini format with fileData (no inline bytes)."""

    def test_file_data_classified(self):
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Analyze this video.'},
                    {'fileData': {
                        'mimeType': 'video/mp4',
                        'fileUri': 'gs://bucket/video.mp4',
                    }},
                ],
            }],
        }
        result = analyze_request_body(body, provider='google')

        self.assertTrue(result.has_video)
        self.assertEqual(result.video_count, 1)
        # No inline data, so no bytes tracked
        self.assertEqual(result.total_media_bytes, 0)


class TestOpenAIVisionFormat(unittest.TestCase):
    """OpenAI Vision format with image_url parts."""

    def test_detects_image_url(self):
        body = {
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'What is in this image?'},
                    {'type': 'image_url', 'image_url': {
                        'url': 'https://example.com/photo.jpg',
                    }},
                ],
            }],
        }
        result = analyze_request_body(body, provider='openai')

        self.assertTrue(result.has_images)
        self.assertEqual(result.image_count, 1)
        self.assertIn('What is in this image?', result.text_parts)

    def test_data_uri_image(self):
        """OpenAI Vision with a base64 data URI should track bytes."""
        raw = b'fake_image_data_here!'
        b64 = base64.b64encode(raw).decode()
        data_uri = f'data:image/png;base64,{b64}'
        body = {
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'Analyze.'},
                    {'type': 'image_url', 'image_url': {'url': data_uri}},
                ],
            }],
        }
        result = analyze_request_body(body, provider='openai')

        self.assertTrue(result.has_images)
        self.assertEqual(result.total_media_bytes, len(raw))
        self.assertEqual(len(result.media_hashes), 1)


class TestTextOnlyRequest(unittest.TestCase):
    """Text-only requests should report no media."""

    def test_openai_string_content(self):
        body = {
            'messages': [
                {'role': 'user', 'content': 'Hello, how are you?'},
                {'role': 'assistant', 'content': 'I am fine.'},
            ],
        }
        result = analyze_request_body(body, provider='openai')

        self.assertFalse(result.has_media)
        self.assertEqual(result.image_count, 0)
        self.assertEqual(result.audio_count, 0)
        self.assertEqual(result.video_count, 0)
        self.assertIn('Hello, how are you?', result.text_parts)
        self.assertIn('I am fine.', result.text_parts)

    def test_gemini_text_only(self):
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Just text, no media.'},
                ],
            }],
        }
        result = analyze_request_body(body, provider='google')

        self.assertFalse(result.has_media)
        self.assertEqual(result.total_media_bytes, 0)


class TestCombinedText(unittest.TestCase):
    """combined_text property should join all text parts."""

    def test_multiple_messages_combined(self):
        body = {
            'messages': [
                {'role': 'user', 'content': 'First message.'},
                {'role': 'user', 'content': 'Second message.'},
            ],
        }
        result = analyze_request_body(body, provider='openai')

        combined = result.combined_text
        self.assertIn('First message.', combined)
        self.assertIn('Second message.', combined)
        # Should be newline-separated
        self.assertEqual(combined, 'First message.\nSecond message.')

    def test_gemini_combined_text(self):
        body = {
            'contents': [
                {'parts': [{'text': 'Part A.'}]},
                {'parts': [{'text': 'Part B.'}]},
            ],
        }
        result = analyze_request_body(body, provider='google')

        self.assertEqual(result.combined_text, 'Part A.\nPart B.')


class TestMediaSummary(unittest.TestCase):
    """media_summary property should return correct counts."""

    def test_summary_with_mixed_media(self):
        img_b64 = base64.b64encode(b'img').decode()
        audio_b64 = base64.b64encode(b'audio_data').decode()
        body = {
            'contents': [{
                'parts': [
                    {'text': 'Mixed.'},
                    {'inlineData': {'mimeType': 'image/png', 'data': img_b64}},
                    {'inlineData': {'mimeType': 'audio/wav', 'data': audio_b64}},
                ],
            }],
        }
        result = analyze_request_body(body, provider='google')
        summary = result.media_summary

        self.assertTrue(summary['has_media'])
        self.assertEqual(summary['images'], 1)
        self.assertEqual(summary['audio'], 1)
        self.assertEqual(summary['video'], 0)
        self.assertEqual(summary['total_media_bytes'], 3 + 10)  # len(b'img') + len(b'audio_data')

    def test_summary_no_media(self):
        analysis = MultimodalAnalysis()
        summary = analysis.media_summary
        self.assertFalse(summary['has_media'])
        self.assertEqual(summary['images'], 0)
        self.assertEqual(summary['audio'], 0)
        self.assertEqual(summary['video'], 0)
        self.assertEqual(summary['total_media_bytes'], 0)


class TestEmptyBody(unittest.TestCase):
    """Empty request bodies should not crash."""

    def test_empty_gemini_body(self):
        result = analyze_request_body({}, provider='google')
        self.assertFalse(result.has_media)
        self.assertEqual(result.combined_text, '')

    def test_empty_openai_body(self):
        result = analyze_request_body({}, provider='openai')
        self.assertFalse(result.has_media)
        self.assertEqual(result.combined_text, '')

    def test_no_provider(self):
        """Default provider should use OpenAI path."""
        body = {
            'messages': [{'role': 'user', 'content': 'Test.'}],
        }
        result = analyze_request_body(body)
        self.assertIn('Test.', result.text_parts)
