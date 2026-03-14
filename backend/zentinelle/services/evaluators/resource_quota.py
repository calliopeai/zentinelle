"""
Resource quota policy evaluator.
"""
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


class ResourceQuotaEvaluator(BasePolicyEvaluator):
    """
    Evaluates resource_quota policies.

    Config schema:
    {
        "max_concurrent_servers": int,
        "max_server_hours_per_month": int,
        "allowed_instance_sizes": ["xsmall", "small", "medium"],
        "allowed_services": ["lab", "chat"],
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

        if action == 'spawn':
            # Check concurrent servers
            max_servers = config.get('max_concurrent_servers')
            current_count = context.get('current_server_count', 0)

            if max_servers is not None and current_count >= max_servers:
                return PolicyResult(
                    passed=False,
                    message=f"Maximum concurrent servers ({max_servers}) reached. Current: {current_count}"
                )

            # Warn if approaching limit
            if max_servers is not None and current_count >= max_servers - 1:
                warnings.append(
                    f"Approaching server limit ({current_count + 1}/{max_servers})"
                )

            # Check instance size
            allowed_sizes = config.get('allowed_instance_sizes', [])
            requested_size = context.get('instance_size')

            if allowed_sizes and requested_size and requested_size not in allowed_sizes:
                return PolicyResult(
                    passed=False,
                    message=f"Instance size '{requested_size}' not allowed. Allowed sizes: {', '.join(allowed_sizes)}"
                )

            # Check service type
            allowed_services = config.get('allowed_services', [])
            requested_service = context.get('service')

            if allowed_services and requested_service and requested_service not in allowed_services:
                return PolicyResult(
                    passed=False,
                    message=f"Service '{requested_service}' not allowed. Allowed services: {', '.join(allowed_services)}"
                )

        # Check server hours (for stop action or spawn with tracking)
        if action in ['spawn', 'stop']:
            max_hours = config.get('max_server_hours_per_month')
            current_hours = context.get('server_hours_this_month', 0)

            if max_hours is not None and current_hours >= max_hours:
                return PolicyResult(
                    passed=False,
                    message=f"Monthly server hour limit ({max_hours}h) reached. Used: {current_hours}h"
                )

            # Warn if approaching limit
            if max_hours is not None and current_hours >= max_hours * 0.8:
                warnings.append(
                    f"Approaching monthly server hour limit ({current_hours}/{max_hours}h)"
                )

        return PolicyResult(passed=True, warnings=warnings)
