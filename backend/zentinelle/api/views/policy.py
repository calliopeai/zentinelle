"""
Policy API endpoints.

GET /api/zentinelle/v1/effective-policy/{user_id}
GET /api/zentinelle/v1/prompts
GET /api/zentinelle/v1/prompts/{service}
"""
import logging
from typing import Optional

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import AgentEndpoint, Policy
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request

logger = logging.getLogger(__name__)


class EffectivePolicyView(APIView):
    """
    Get effective policies for a user at this endpoint.

    Returns the resolved policy configuration after inheritance:
    Organization → Deployment → Endpoint → User

    Used by JunoHub at spawn time to get the configuration
    that should apply to a specific user session.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id: str = None):
        """
        GET /api/zentinelle/v1/effective-policy/{user_id}

        Query params:
            policy_types: Comma-separated list of policy types to include
                         (e.g., 'system_prompt,ai_guardrail,tool_permission')

        Returns:
            {
                "policies": [...],
                "system_prompt": "...",
                "ai_config": {...},
                "tool_permissions": {...},
                "rate_limits": {...},
                "budget_limits": {...},
            }
        """
        # Get authenticated endpoint
        endpoint = get_endpoint_from_request(request)

        # Parse policy types filter
        policy_types_param = request.query_params.get('policy_types', '')
        policy_types = [t.strip() for t in policy_types_param.split(',') if t.strip()] or None

        # Get effective policies
        from zentinelle.services.policy_engine import PolicyEngine
        engine = PolicyEngine()
        policies = engine.get_effective_policies(
            endpoint=endpoint,
            user_id=user_id,
            policy_types=policy_types,
        )

        # Build response with structured sections
        response_data = {
            'policies': [self._serialize_policy(p) for p in policies],
            'resolved': self._build_resolved_config(policies, endpoint, user_id),
        }

        return Response(response_data, status=status.HTTP_200_OK)

    def _serialize_policy(self, policy: Policy) -> dict:
        """Serialize a policy to JSON."""
        return {
            'id': str(policy.id),
            'name': policy.name,
            'type': policy.policy_type,
            'scope': policy.scope_type,
            'priority': policy.priority,
            'enforcement': policy.enforcement,
            'config': policy.config,
        }

    def _build_resolved_config(
        self,
        policies: list,
        endpoint: AgentEndpoint,
        user_id: Optional[str]
    ) -> dict:
        """
        Build resolved configuration from policies.

        This merges all policy configs into actionable settings.
        """
        resolved = {
            'system_prompt': None,
            'ai_guardrails': {},
            'tool_permissions': {
                'allowed': [],
                'denied': [],
                'requires_approval': [],
            },
            'rate_limits': {},
            'budget_limits': {},
            'resource_quotas': {},
            'secret_access': {
                'allowed_bundles': [],
                'denied_providers': [],
            },
        }

        for policy in policies:
            config = policy.config or {}

            if policy.policy_type == Policy.PolicyType.SYSTEM_PROMPT:
                # System prompt - use the most specific one
                resolved['system_prompt'] = config.get('prompt_text', '')

            elif policy.policy_type == Policy.PolicyType.AI_GUARDRAIL:
                # Merge guardrail settings
                resolved['ai_guardrails'] = {
                    'blocked_topics': config.get('blocked_topics', []),
                    'pii_redaction': config.get('pii_redaction', False),
                    'toxicity_threshold': config.get('toxicity_threshold', 0.8),
                    'prompt_injection_detection': config.get('prompt_injection_detection', True),
                }

            elif policy.policy_type == Policy.PolicyType.TOOL_PERMISSION:
                # Merge tool permissions
                allowed = config.get('allowed_tools', [])
                denied = config.get('denied_tools', [])
                approval = config.get('requires_approval', [])

                resolved['tool_permissions']['allowed'].extend(allowed)
                resolved['tool_permissions']['denied'].extend(denied)
                resolved['tool_permissions']['requires_approval'].extend(approval)

            elif policy.policy_type == Policy.PolicyType.RATE_LIMIT:
                # Most specific rate limit wins
                resolved['rate_limits'] = {
                    'requests_per_minute': config.get('requests_per_minute', 60),
                    'requests_per_hour': config.get('requests_per_hour', 1000),
                    'tokens_per_day': config.get('tokens_per_day', 1000000),
                }

            elif policy.policy_type == Policy.PolicyType.BUDGET_LIMIT:
                # Most specific budget wins
                resolved['budget_limits'] = {
                    'monthly_budget_usd': config.get('monthly_budget_usd', 100),
                    'alert_threshold_percent': config.get('alert_threshold_percent', 80),
                    'hard_limit': config.get('hard_limit', False),
                }

            elif policy.policy_type == Policy.PolicyType.RESOURCE_QUOTA:
                # Most specific quota wins
                resolved['resource_quotas'] = {
                    'max_concurrent_servers': config.get('max_concurrent_servers', 5),
                    'max_server_hours_per_month': config.get('max_server_hours_per_month', 1000),
                    'allowed_instance_sizes': config.get('allowed_instance_sizes', []),
                    'allowed_services': config.get('allowed_services', []),
                }

            elif policy.policy_type == Policy.PolicyType.SECRET_ACCESS:
                # Merge secret access
                allowed = config.get('allowed_bundles', [])
                denied = config.get('denied_providers', [])

                resolved['secret_access']['allowed_bundles'].extend(allowed)
                resolved['secret_access']['denied_providers'].extend(denied)

        # Deduplicate lists
        resolved['tool_permissions']['allowed'] = list(set(resolved['tool_permissions']['allowed']))
        resolved['tool_permissions']['denied'] = list(set(resolved['tool_permissions']['denied']))
        resolved['tool_permissions']['requires_approval'] = list(set(resolved['tool_permissions']['requires_approval']))
        resolved['secret_access']['allowed_bundles'] = list(set(resolved['secret_access']['allowed_bundles']))
        resolved['secret_access']['denied_providers'] = list(set(resolved['secret_access']['denied_providers']))

        return resolved


class SystemPromptsView(APIView):
    """
    Get system prompts for this endpoint.

    Used by agents to retrieve configured system prompts.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, service: str = None):
        """
        GET /api/zentinelle/v1/prompts
        GET /api/zentinelle/v1/prompts/{service}

        Query params:
            user_id: Optional user ID to resolve user-specific prompts

        Returns:
            {
                "prompts": [
                    {"service": "lab", "prompt": "..."},
                    {"service": "chat", "prompt": "..."},
                ]
            }
            or
            {
                "prompt": "..."
            }
            when service is specified
        """
        endpoint = get_endpoint_from_request(request)
        user_id = request.query_params.get('user_id')

        # Get system prompt policies
        from zentinelle.services.policy_engine import PolicyEngine
        engine = PolicyEngine()
        policies = engine.get_effective_policies(
            endpoint=endpoint,
            user_id=user_id,
            policy_types=[Policy.PolicyType.SYSTEM_PROMPT],
        )

        # Build prompts dict by service
        prompts = {}
        default_prompt = None

        for policy in policies:
            config = policy.config or {}
            prompt_text = config.get('prompt_text', '')
            applies_to = config.get('applies_to', ['all'])

            if 'all' in applies_to:
                default_prompt = prompt_text

            for svc in applies_to:
                if svc != 'all':
                    prompts[svc] = prompt_text

        # If specific service requested
        if service:
            prompt = prompts.get(service) or default_prompt or ''
            return Response({
                'service': service,
                'prompt': prompt,
            }, status=status.HTTP_200_OK)

        # Return all prompts
        result = []
        all_services = ['chat', 'lab', 'agent']  # Known services

        for svc in all_services:
            result.append({
                'service': svc,
                'prompt': prompts.get(svc) or default_prompt or '',
            })

        return Response({
            'prompts': result,
            'default': default_prompt or '',
        }, status=status.HTTP_200_OK)
