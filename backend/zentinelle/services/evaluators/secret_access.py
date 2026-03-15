"""
Secret access policy evaluator.
"""
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


class SecretAccessEvaluator(BasePolicyEvaluator):
    """
    Evaluates secret_access policies.

    Config schema:
    {
        "allowed_bundles": ["ai-keys", "database-creds"],
        "denied_providers": ["anthropic"],
    }
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

        # Only evaluate for secret access actions
        if action != 'secret_access':
            return PolicyResult(passed=True)

        # Check bundle access
        requested_bundle = context.get('bundle_slug')
        if requested_bundle:
            allowed_bundles = config.get('allowed_bundles', [])
            if allowed_bundles and requested_bundle not in allowed_bundles:
                return PolicyResult(
                    passed=False,
                    message=f"Access to secret bundle '{requested_bundle}' is not allowed"
                )

        # Check provider restrictions (for AI key bundles)
        requested_provider = context.get('provider')
        if requested_provider:
            denied_providers = config.get('denied_providers', [])
            if requested_provider in denied_providers:
                return PolicyResult(
                    passed=False,
                    message=f"Access to provider '{requested_provider}' is denied"
                )

        return PolicyResult(passed=True)
