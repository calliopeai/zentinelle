"""
Multimodal content policy evaluator.

Controls whether agents can send images, audio, or video through the proxy.

Policy config example:
{
    "allow_images": true,
    "allow_audio": false,
    "allow_video": false,
    "max_media_bytes": 10485760,
    "scan_text_parts": true
}
"""
import logging
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from .base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class MultimodalPolicyEvaluator(BasePolicyEvaluator):

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        if action not in ('llm:invoke', 'model_request'):
            return PolicyResult(passed=True)

        if not context.get('has_multimodal'):
            return PolicyResult(passed=True)

        config = policy.config or {}
        mm = context.get('multimodal', {})
        warnings = []

        if mm.get('images', 0) > 0 and not config.get('allow_images', True):
            return PolicyResult(
                passed=False,
                message='Image content is not allowed by policy',
            )

        if mm.get('audio', 0) > 0 and not config.get('allow_audio', True):
            return PolicyResult(
                passed=False,
                message='Audio content is not allowed by policy',
            )

        if mm.get('video', 0) > 0 and not config.get('allow_video', True):
            return PolicyResult(
                passed=False,
                message='Video content is not allowed by policy',
            )

        max_bytes = config.get('max_media_bytes', 0)
        if max_bytes and mm.get('total_media_bytes', 0) > max_bytes:
            return PolicyResult(
                passed=False,
                message=f'Media size {mm["total_media_bytes"]} bytes exceeds limit of {max_bytes} bytes',
            )

        if mm.get('has_media'):
            warnings.append(
                f'Multimodal content detected: {mm.get("images", 0)} images, '
                f'{mm.get("audio", 0)} audio, {mm.get("video", 0)} video'
            )

        return PolicyResult(passed=True, warnings=warnings)
