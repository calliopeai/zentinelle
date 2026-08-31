"""
Agent summary for the Astrolift integration card.

Astrolift's OBSERVE > Agents panel shows a compact "Powered by Zentinelle"
card before offering deeplinks into the Zentinelle portal. This endpoint is
the only thing that card needs: enough to show value without embedding the
portal.

Authenticated with a platform service key, not an agent key, because the
caller is Astrolift acting on behalf of a whole tenant. The agent_id is always
resolved inside the key's tenant, so one tenant can never read another's agent
by guessing a slug.
"""
import logging
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import ZentinelleServiceKeyAuthentication
from zentinelle.api.permissions import IsServiceKey
from zentinelle.models import (
    AgentEndpoint,
    ComplianceFrameworkConfig,
    ContentViolation,
    Event,
    UsageMetric,
)

logger = logging.getLogger(__name__)

# The card is glanceable, not authoritative. A minute of staleness is fine and
# keeps a busy Astrolift panel from turning into a per-render aggregate query.
CACHE_TTL_SECONDS = 60

TOKEN_METRIC_TYPES = (
    'ai_input_tokens',
    'ai_output_tokens',
    'ai_total_tokens',
)


class AgentSummaryView(APIView):
    """GET /api/zentinelle/v1/agent/{agent_id}/summary"""

    authentication_classes = [ZentinelleServiceKeyAuthentication]
    permission_classes = [IsServiceKey]

    def get(self, request, agent_id: str):
        tenant_id = request.user.tenant_id

        cache_key = f'agent-summary:{tenant_id}:{agent_id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        # Scoped to the key's tenant. A slug that exists in another tenant is
        # a 404 here, exactly as if it did not exist at all.
        endpoint = AgentEndpoint.objects.filter(
            tenant_id=tenant_id, agent_id=agent_id
        ).first()
        if endpoint is None:
            return Response(
                {'error': f'Agent "{agent_id}" not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        now = timezone.now()
        since_24h = now - timedelta(hours=24)
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        last_event = (
            Event.objects.filter(endpoint=endpoint)
            .order_by('-occurred_at')
            .values_list('occurred_at', flat=True)
            .first()
        )

        violation_count_24h = ContentViolation.objects.filter(
            scan__endpoint=endpoint,
            created_at__gte=since_24h,
        ).count()

        token_rows = (
            UsageMetric.objects.filter(
                endpoint=endpoint,
                metric_type__in=TOKEN_METRIC_TYPES,
                occurred_at__gte=start_of_day,
            )
            .values('ai_provider')
            .annotate(total=Sum('value'))
        )
        by_provider = {
            (row['ai_provider'] or 'unknown'): int(row['total'] or 0)
            for row in token_rows
        }

        frameworks = list(
            ComplianceFrameworkConfig.objects.filter(
                tenant_id=tenant_id, is_enabled=True
            )
            .order_by('framework_id')
            .values_list('framework_id', flat=True)
        )

        payload = {
            'agent_id': endpoint.agent_id,
            'status': endpoint.status,
            'health': endpoint.health,
            'last_event_at': last_event.isoformat() if last_event else None,
            'violation_count_24h': violation_count_24h,
            'policy_count': self._policy_count(endpoint),
            'token_usage_today': {
                'total': sum(by_provider.values()),
                'by_provider': by_provider,
            },
            'compliance_frameworks': frameworks,
        }

        cache.set(cache_key, payload, CACHE_TTL_SECONDS)
        return Response(payload)

    @staticmethod
    def _policy_count(endpoint: AgentEndpoint) -> int:
        """Policies actually in force for this agent, not every tenant policy."""
        from zentinelle.services.policy_engine import PolicyEngine

        try:
            return len(PolicyEngine().get_effective_policies(endpoint))
        except Exception:
            # The card must render even if policy resolution is unhappy.
            logger.exception(
                "Policy resolution failed for agent %s", endpoint.agent_id
            )
            return 0
