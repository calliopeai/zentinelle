"""
Agent deregistration endpoint.
POST /api/zentinelle/v1/deregister

Marks the agent endpoint as terminated, cleans up Redis cache keys,
and writes an audit event. Idempotent — safe to call more than once.
"""
import logging

from django.http import JsonResponse
from django.views import View
from django.core.cache import cache
from django.utils import timezone

from zentinelle.auth.resolver import StandaloneTenantResolver
from zentinelle.models import AgentEndpoint, Event

logger = logging.getLogger(__name__)

# Cache key templates — must match what other services write.
_CONFIG_CACHE_KEY = "zentinelle:config:{agent_id}"
_BASELINE_CACHE_KEY = "baseline:{tenant_id}:{agent_id}"


class DeregisterView(View):
    """
    Deregister an agent endpoint.

    Authenticates via the agent's sk_agent_* API key, marks the endpoint
    as terminated, cleans up Redis cache entries, and writes an audit event.

    Returns 204 No Content on success.  Idempotent: already-terminated
    endpoints are accepted without error.
    """

    def post(self, request):
        # 1. Validate the agent key (same pattern as proxy views)
        zentinelle_key = request.META.get('HTTP_X_ZENTINELLE_KEY', '').strip()
        if not zentinelle_key:
            return JsonResponse(
                {'error': 'missing_key', 'detail': 'X-Zentinelle-Key header is required'},
                status=401,
            )

        resolver = StandaloneTenantResolver()
        auth = resolver._validate_agent_key(zentinelle_key)

        if not auth.valid:
            return JsonResponse(
                {'error': 'invalid_key', 'detail': auth.error or 'Invalid agent key'},
                status=401,
            )

        # 2. Resolve the AgentEndpoint from the auth context.
        #    user_id is "agent:<uuid>" when set by _validate_agent_key.
        agent_user_id = auth.user_id or ''
        endpoint = None

        if agent_user_id.startswith('agent:'):
            endpoint_id = agent_user_id[len('agent:'):]
            try:
                endpoint = AgentEndpoint.objects.get(pk=endpoint_id)
            except AgentEndpoint.DoesNotExist:
                pass

        if endpoint is None:
            # Key was valid but we could not resolve the endpoint — treat as
            # invalid to avoid leaving orphaned state.
            return JsonResponse(
                {'error': 'endpoint_not_found', 'detail': 'Agent endpoint could not be resolved'},
                status=401,
            )

        # 3. Idempotency — if already terminated, return success immediately.
        if endpoint.status == AgentEndpoint.Status.TERMINATED:
            logger.info("Deregister called on already-terminated endpoint: %s", endpoint.agent_id)
            return JsonResponse({}, status=204)

        # 4. Mark endpoint as terminated.
        endpoint.status = AgentEndpoint.Status.TERMINATED
        endpoint.health = AgentEndpoint.Health.UNKNOWN
        endpoint.save(update_fields=['status', 'health', 'updated_at'])

        logger.info("Deregistered agent: %s (tenant: %s)", endpoint.agent_id, endpoint.tenant_id)

        # 5. Clean up Redis cache entries for this agent (graceful — cache may
        #    be unavailable, or the keys may never have been set).
        self._purge_agent_cache(endpoint.agent_id, endpoint.tenant_id)

        # 6. Write an audit event.
        self._create_deregister_event(endpoint)

        return JsonResponse({}, status=204)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _purge_agent_cache(self, agent_id: str, tenant_id: str) -> None:
        """Delete per-agent Redis cache entries."""
        keys_to_delete = [
            _CONFIG_CACHE_KEY.format(agent_id=agent_id),
            _BASELINE_CACHE_KEY.format(tenant_id=tenant_id, agent_id=agent_id),
        ]
        for key in keys_to_delete:
            try:
                cache.delete(key)
            except Exception as exc:
                logger.warning("Failed to delete cache key %s: %s", key, exc)

    def _create_deregister_event(self, endpoint: AgentEndpoint) -> None:
        """Write a STOP audit event for the deregistered agent."""
        try:
            event = Event.objects.create(
                endpoint=endpoint,
                tenant_id=endpoint.tenant_id,
                event_type=Event.EventType.STOP,
                event_category=Event.Category.AUDIT,
                payload={
                    'agent_id': endpoint.agent_id,
                    'source': 'agent',
                    'reason': 'deregistered',
                },
                occurred_at=timezone.now(),
                status=Event.Status.PENDING,
            )

            # Fire the async event processor (best-effort)
            try:
                from zentinelle.tasks.events import process_event_batch
                process_event_batch.apply_async(
                    args=[[str(event.id)], 'audit'],
                )
            except Exception as exc:
                logger.warning("Failed to queue deregister audit event: %s", exc)

        except Exception as exc:
            # Never fail the deregistration because of an audit write error.
            logger.error("Failed to create deregister audit event for %s: %s", endpoint.agent_id, exc)
