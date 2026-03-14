"""
Budget limit policy evaluator.
"""
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


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
    ) -> PolicyResult:
        config = policy.config
        warnings = []

        monthly_budget = config.get('monthly_budget_usd')
        alert_threshold = config.get('alert_threshold_percent', 80)
        hard_limit = config.get('hard_limit', True)

        if monthly_budget is None:
            return PolicyResult(passed=True)

        # Get current spend from context
        current_spend = context.get('current_month_spend_usd', 0)
        remaining = monthly_budget - current_spend

        # Calculate percentage used
        percent_used = (current_spend / monthly_budget) * 100 if monthly_budget > 0 else 0

        # Check if over budget
        if current_spend >= monthly_budget:
            if hard_limit:
                return PolicyResult(
                    passed=False,
                    message=f"Monthly budget exceeded. Budget: ${monthly_budget:.2f}, Spent: ${current_spend:.2f}"
                )
            else:
                warnings.append(
                    f"Monthly budget exceeded (soft limit). Budget: ${monthly_budget:.2f}, Spent: ${current_spend:.2f}"
                )

        # Check if approaching limit
        elif percent_used >= alert_threshold:
            warnings.append(
                f"Approaching budget limit ({percent_used:.1f}% used). Remaining: ${remaining:.2f}"
            )

        # Add budget info to context for response
        context['budget_info'] = {
            'monthly_budget_usd': monthly_budget,
            'current_spend_usd': current_spend,
            'remaining_usd': remaining,
            'percent_used': percent_used,
        }

        return PolicyResult(passed=True, warnings=warnings)
