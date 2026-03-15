"""
Model Restriction Evaluator.
Enforces which AI models an agent is allowed to use.
"""
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


class ModelRestrictionEvaluator(BasePolicyEvaluator):
    """
    Enforces model allowlist/blocklist policies.

    Config schema:
    {
        "allowed_models": ["gpt-4o", "claude-opus-4"],  # allowlist (OR with allowed_providers)
        "allowed_providers": ["anthropic", "openai"],    # provider-level allow
        "blocked_models": ["gpt-4o", ...],              # explicit blocklist
        "blocked_providers": ["deepseek", ...],         # provider-level block
    }

    Context required:
    - "model": str  — the model ID being requested (e.g. "gpt-4o")
    - "provider": str  — optional provider slug (e.g. "openai")

    Logic:
    - If blocked_models or blocked_providers match → deny
    - If allowed_models or allowed_providers is set and doesn't match → deny
    - Otherwise → allow
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

        model = context.get('model')
        provider = context.get('provider')

        # Nothing to check if no model in context
        if not model and not provider:
            return PolicyResult(passed=True)

        # Check explicit blocklist first
        blocked_models = config.get('blocked_models', [])
        if model and model in blocked_models:
            return PolicyResult(
                passed=False,
                message=f"Model '{model}' is explicitly blocked",
            )

        blocked_providers = config.get('blocked_providers', [])
        if provider and provider in blocked_providers:
            return PolicyResult(
                passed=False,
                message=f"Provider '{provider}' is explicitly blocked",
            )

        # Check allowlist (if specified, must match at least one)
        allowed_models = config.get('allowed_models', [])
        allowed_providers = config.get('allowed_providers', [])

        if allowed_models or allowed_providers:
            model_ok = bool(model and model in allowed_models)
            provider_ok = bool(provider and provider in allowed_providers)

            if not model_ok and not provider_ok:
                # Build a helpful message
                parts = []
                if allowed_models:
                    parts.append(f"allowed models: {', '.join(allowed_models)}")
                if allowed_providers:
                    parts.append(f"allowed providers: {', '.join(allowed_providers)}")
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Model '{model}' / provider '{provider}' is not permitted. "
                        + "; ".join(parts)
                    ),
                )

        return PolicyResult(passed=True)
