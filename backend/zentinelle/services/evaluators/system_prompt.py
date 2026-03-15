"""
System prompt policy evaluator.

Validates system prompt configuration and enforces override restrictions.
"""
import logging
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class SystemPromptEvaluator(BasePolicyEvaluator):
    """
    Evaluates system_prompt policies.

    Config schema:
    {
        "allow_user_override": false,
        "required_sections": ["safety_instructions", "role_definition"],
        "max_length": 8000,
        "required_keywords": ["Do not", "You are"]
    }

    Checks:
    1. If allow_user_override is false and context contains a user-supplied
       system_prompt, deny the action.
    2. If required_sections are defined, verify context system_prompt contains
       all of them.
    3. Enforce max_length on the system_prompt in context.
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

        allow_user_override = config.get('allow_user_override', True)
        user_supplied_prompt = context.get('system_prompt_override')

        # 1. Block user-supplied system prompt override if not permitted
        if not allow_user_override and user_supplied_prompt:
            return PolicyResult(
                passed=False,
                message=(
                    f"Policy '{policy.name}' does not allow user-supplied system prompt overrides."
                ),
            )

        # 2. Validate active system prompt (from context or override)
        active_prompt = user_supplied_prompt or context.get('system_prompt', '')

        if active_prompt:
            # Max length
            max_length = config.get('max_length')
            if max_length and len(active_prompt) > max_length:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"System prompt length {len(active_prompt)} exceeds "
                        f"maximum allowed {max_length} characters."
                    ),
                )

            # Required sections
            required_sections = config.get('required_sections', [])
            for section in required_sections:
                if section.lower() not in active_prompt.lower():
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"System prompt is missing required section: '{section}'."
                        ),
                    )

            # Required keywords
            required_keywords = config.get('required_keywords', [])
            for keyword in required_keywords:
                if keyword not in active_prompt:
                    warnings.append(
                        f"System prompt is missing recommended keyword: '{keyword}'."
                    )

        return PolicyResult(passed=True, warnings=warnings)
