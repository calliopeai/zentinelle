"""
Multimodal content detection and scanning.

Extracts text from multimodal LLM request bodies (Gemini, OpenAI Vision)
and detects non-text content (images, audio, video) for logging and
policy enforcement.
"""
import base64
import hashlib
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class MultimodalAnalysis:
    text_parts: list[str] = field(default_factory=list)
    has_images: bool = False
    has_audio: bool = False
    has_video: bool = False
    image_count: int = 0
    audio_count: int = 0
    video_count: int = 0
    total_media_bytes: int = 0
    media_hashes: list[str] = field(default_factory=list)

    @property
    def has_media(self) -> bool:
        return self.has_images or self.has_audio or self.has_video

    @property
    def combined_text(self) -> str:
        return '\n'.join(self.text_parts)

    @property
    def media_summary(self) -> dict:
        return {
            'has_media': self.has_media,
            'images': self.image_count,
            'audio': self.audio_count,
            'video': self.video_count,
            'total_media_bytes': self.total_media_bytes,
        }


def analyze_request_body(body: dict, provider: str = '') -> MultimodalAnalysis:
    """Analyze an LLM request body for multimodal content."""
    if provider in ('google', 'vertex'):
        return _analyze_gemini(body)
    return _analyze_openai(body)


def _analyze_gemini(body: dict) -> MultimodalAnalysis:
    """Analyze Gemini-format request body."""
    result = MultimodalAnalysis()

    contents = body.get('contents', [])
    for content in contents:
        parts = content.get('parts', [])
        for part in parts:
            if 'text' in part:
                result.text_parts.append(part['text'])
            elif 'inlineData' in part:
                inline = part['inlineData']
                mime = inline.get('mimeType', '')
                data = inline.get('data', '')
                _classify_media(result, mime, data)
            elif 'fileData' in part:
                mime = part['fileData'].get('mimeType', '')
                _classify_media_type(result, mime)

    return result


def _analyze_openai(body: dict) -> MultimodalAnalysis:
    """Analyze OpenAI-format request body (Vision API)."""
    result = MultimodalAnalysis()

    messages = body.get('messages', [])
    for msg in messages:
        content = msg.get('content', '')
        if isinstance(content, str):
            result.text_parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    if part.get('type') == 'text':
                        result.text_parts.append(part.get('text', ''))
                    elif part.get('type') == 'image_url':
                        result.has_images = True
                        result.image_count += 1
                        url = part.get('image_url', {}).get('url', '')
                        if url.startswith('data:'):
                            _extract_data_uri_size(result, url)

    return result


def _classify_media(result: MultimodalAnalysis, mime: str, data_b64: str):
    _classify_media_type(result, mime)
    if data_b64:
        try:
            raw = base64.b64decode(data_b64)
            result.total_media_bytes += len(raw)
            result.media_hashes.append(hashlib.sha256(raw).hexdigest()[:16])
        except Exception:
            pass


def _classify_media_type(result: MultimodalAnalysis, mime: str):
    if mime.startswith('image/'):
        result.has_images = True
        result.image_count += 1
    elif mime.startswith('audio/'):
        result.has_audio = True
        result.audio_count += 1
    elif mime.startswith('video/'):
        result.has_video = True
        result.video_count += 1


def _extract_data_uri_size(result: MultimodalAnalysis, data_uri: str):
    try:
        header, data = data_uri.split(',', 1)
        raw = base64.b64decode(data)
        result.total_media_bytes += len(raw)
        result.media_hashes.append(hashlib.sha256(raw).hexdigest()[:16])
    except Exception:
        pass
