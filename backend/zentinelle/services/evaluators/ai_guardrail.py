"""
AI guardrail policy evaluator.

Enforces topic restrictions and blocked content patterns on agent inputs/outputs.
"""
import re
import logging
from typing import Dict, Any, Optional, List

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class AIGuardrailEvaluator(BasePolicyEvaluator):
    """
    Evaluates ai_guardrail policies.

    Config schema:
    {
        "blocked_topics": ["weapons", "self-harm", "illegal activities"],
        "blocked_content_patterns": ["pattern1", "regex2"],
        "safety_level": "strict",       # "strict" | "moderate" | "permissive"
        "allowed_topics": ["coding", "data analysis"],
        "block_on_topic_ambiguity": false
    }

    Context keys checked:
        "input_text"    — user input to be scanned
        "output_text"   — agent output to be scanned
        "topic"         — explicitly declared topic (skips pattern inference)

    Evaluation order:
    1. Blocked content patterns (regex) on input/output text → deny
    2. Blocked topics matched against topic or text → deny
    3. Allowed topics allowlist (if set) → deny if topic not in list
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        config = policy.config
        warnings = []

        input_text = context.get('input_text', '')
        output_text = context.get('output_text', '')
        topic = context.get('topic', '')

        # Combine text for scanning
        texts_to_scan = [t for t in [input_text, output_text, topic] if t]

        # 1. Blocked content patterns (regex)
        blocked_patterns = config.get('blocked_content_patterns', [])
        for raw_pattern in blocked_patterns:
            try:
                pattern = re.compile(raw_pattern, re.IGNORECASE)
            except re.error:
                logger.warning("Invalid regex in ai_guardrail policy %s: %s", policy.id, raw_pattern)
                continue
            for text in texts_to_scan:
                if pattern.search(text):
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Content matches blocked pattern in policy '{policy.name}'."
                        ),
                    )

        # 2. Blocked topics
        blocked_topics = config.get('blocked_topics', [])
        safety_level = config.get('safety_level', 'moderate')

        for blocked_topic in blocked_topics:
            for text in texts_to_scan:
                if blocked_topic.lower() in text.lower():
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Content involves a blocked topic '{blocked_topic}' "
                            f"under policy '{policy.name}' (safety_level={safety_level})."
                        ),
                    )

        # 3. Allowed topics allowlist (if topic provided)
        allowed_topics = config.get('allowed_topics', [])
        if allowed_topics and topic:
            matched = any(
                allowed.lower() in topic.lower() or topic.lower() in allowed.lower()
                for allowed in allowed_topics
            )
            if not matched:
                block_on_ambiguity = config.get('block_on_topic_ambiguity', False)
                if block_on_ambiguity:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Topic '{topic}' is not in the allowed topics list for policy '{policy.name}'."
                        ),
                    )
                else:
                    warnings.append(
                        f"Topic '{topic}' does not match any allowed topics. "
                        f"Allowed: {', '.join(allowed_topics)}"
                    )

        return PolicyResult(passed=True, warnings=warnings)
