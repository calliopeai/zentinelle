"""
Agent configuration endpoint.
GET /api/zentinelle/v1/config/{agent_id}
"""
import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.cache import cache

from zentinelle.models import AgentEndpoint
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request

logger = logging.getLogger(__name__)

# Cache TTL for config (5 minutes)
CONFIG_CACHE_TTL = 300


class ConfigView(APIView):
    """
    Get configuration and policies for an agent.

    Returns the runtime config and all effective policies
    that apply to this endpoint.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id: str):
        # Get authenticated endpoint
        auth_endpoint = get_endpoint_from_request(request)

        # Verify the requested agent_id matches the authenticated endpoint
        if auth_endpoint.agent_id != agent_id:
            return Response(
                {'error': 'Not authorized to access this endpoint config'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Try cache first (gracefully handle cache failures)
        cache_key = f"zentinelle:config:{agent_id}"
        try:
            cached = cache.get(cache_key)
            if cached:
                return Response(cached)
        except Exception:
            logger.warning("Cache unavailable, skipping cache lookup")

        # Build response
        from zentinelle.services.policy_engine import PolicyEngine
        engine = PolicyEngine()
        policies = engine.get_effective_policies(auth_endpoint)

        response_data = {
            'agent_id': auth_endpoint.agent_id,
            'config': auth_endpoint.config,
            'policies': [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'type': p.policy_type,
                    'enforcement': p.enforcement,
                    'config': p.config,
                }
                for p in policies
            ],
            'updated_at': auth_endpoint.updated_at.isoformat(),
        }

        # Cache the response (gracefully handle cache failures)
        try:
            cache.set(cache_key, response_data, CONFIG_CACHE_TTL)
        except Exception:
            logger.warning("Cache unavailable, skipping cache write")

        return Response(response_data)


def invalidate_config_cache(agent_id: str):
    """Helper to invalidate config cache when config changes."""
    cache_key = f"zentinelle:config:{agent_id}"
    cache.delete(cache_key)


def invalidate_org_config_cache(organization_id):
    """Invalidate config cache for all endpoints in an org."""
    endpoints = AgentEndpoint.objects.filter(
        tenant_id=tenant_id
    ).values_list('agent_id', flat=True)

    for agent_id in endpoints:
        invalidate_config_cache(agent_id)
