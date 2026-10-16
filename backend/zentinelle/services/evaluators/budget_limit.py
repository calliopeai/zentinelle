"""
Budget limit policy evaluator.
"""
from typing import Any, Dict, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import (BasePolicyEvaluator,
                                                 PolicyResult)


class BudgetLimitEvaluator(BasePolicyEvaluator):
    """
    Evaluates budget_limit policies.

    Config schema:
    {
        "monthly_budget_usd": 500.00,
        "alert_threshold_percent": 80,
        "hard_limit": true,
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
        hard_limit = policy.config.get('hard_limit', True)

        from zentinelle.services.budgets import budget_status
        try:
            status = budget_status(policy)
        except (ValueError, ArithmeticError):
            return PolicyResult(passed=False, message='Invalid monthly budget configuration')
        monthly_budget = float(status['limit'])
        current_spend = float(status['spend'])
        remaining = float(status['remaining'])
        percent_used = float(status['percent'])

        warnings = []
        if status['unpriced_calls']:
            warnings.append(
                f"{status['unpriced_calls']} call(s) this month used a model with no price; "
                "their cost is unknown and not in the spend shown"
            )

        # Add budget info to context for response
        context['budget_info'] = {
            'monthly_budget_usd': monthly_budget,
            'current_spend_usd': current_spend,
            'remaining_usd': remaining,
            'percent_used': percent_used,
        }

        if status['level'] == 'exceeded':
            message = f"Monthly budget exceeded. Budget: ${monthly_budget:.2f}, Spent: ${current_spend:.2f}"
            if hard_limit:
                return PolicyResult(passed=False, message=message, warnings=warnings)
            # A soft budget's match takes the policy's action (an alert for the
            # seeded budget) but never refuses the call.
            return PolicyResult(passed=False, message=f"{message} (soft limit)", warnings=warnings, advisory=True)

        if status['level'] == 'threshold':
            message = f"Approaching budget limit ({percent_used:.1f}% used). Remaining: ${remaining:.2f}"
            if not hard_limit:
                return PolicyResult(passed=False, message=message, warnings=warnings, advisory=True)
            warnings.append(message)

        return PolicyResult(passed=True, warnings=warnings)
