"""
Gemini Safety Settings Evaluator.

Enforces minimum safety thresholds for Gemini API calls.
Inspects the safetySettings field in the request context and
blocks requests that lower thresholds below the policy minimum.

Policy config example:
{
    "min_thresholds": {
        "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_HATE_SPEECH": "BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_MEDIUM_AND_ABOVE",
        "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_MEDIUM_AND_ABOVE"
    },
    "block_none_disabled": true
}
"""
import logging
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from .base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)

THRESHOLD_ORDER = [
    'BLOCK_NONE',
    'BLOCK_ONLY_HIGH',
    'BLOCK_MEDIUM_AND_ABOVE',
    'BLOCK_LOW_AND_ABOVE',
]

THRESHOLD_RANK = {t: i for i, t in enumerate(THRESHOLD_ORDER)}


class SafetySettingsEvaluator(BasePolicyEvaluator):

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

        provider = context.get('provider', '')
        if provider not in ('google', 'vertex', 'gemini'):
            model = context.get('model', '')
            if not any(x in model.lower() for x in ('gemini', 'palm')):
                return PolicyResult(passed=True)

        config = policy.config or {}
        min_thresholds = config.get('min_thresholds', {})
        block_none_disabled = config.get('block_none_disabled', True)

        request_settings = context.get('safety_settings', [])
        if not request_settings and not min_thresholds:
            return PolicyResult(passed=True)

        settings_map = {}
        for s in request_settings:
            cat = s.get('category', '')
            thresh = s.get('threshold', '')
            if cat and thresh:
                settings_map[cat] = thresh

        warnings = []

        if block_none_disabled:
            for cat, thresh in settings_map.items():
                if thresh == 'BLOCK_NONE':
                    return PolicyResult(
                        passed=False,
                        message=f'Safety setting BLOCK_NONE is not allowed for {cat}',
                    )

        for cat, min_thresh in min_thresholds.items():
            agent_thresh = settings_map.get(cat)
            if not agent_thresh:
                continue

            min_rank = THRESHOLD_RANK.get(min_thresh, 2)
            agent_rank = THRESHOLD_RANK.get(agent_thresh, 2)

            if agent_rank < min_rank:
                return PolicyResult(
                    passed=False,
                    message=f'Safety threshold for {cat} is {agent_thresh}, '
                            f'minimum required is {min_thresh}',
                )

            if agent_rank == min_rank and min_rank < len(THRESHOLD_ORDER) - 1:
                warnings.append(
                    f'{cat} safety threshold is at the minimum allowed level ({agent_thresh})'
                )

        return PolicyResult(passed=True, warnings=warnings)
