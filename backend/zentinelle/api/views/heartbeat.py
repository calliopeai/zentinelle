"""
Heartbeat endpoint for agents.
POST /api/zentinelle/v1/heartbeat

In standalone mode, only agent heartbeats (sk_agent_) are supported.
Deployment heartbeats are handled by the client-cove integration layer.
"""
import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone

from zentinelle.models import AgentEndpoint, Event
from zentinelle.api.auth import (
    ZentinelleAPIKeyAuthentication,
    ZentinelleAgentUser,
    get_endpoint_from_request,
)
from zentinelle.api.serializers import HeartbeatRequestSerializer

logger = logging.getLogger(__name__)


class HeartbeatView(APIView):
    """
    Receive heartbeat from an agent.

    Updates agent endpoint health status and creates a telemetry event.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = HeartbeatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if isinstance(request.user, ZentinelleAgentUser):
            return self._handle_agent_heartbeat(request, data)
        else:
            return Response(
                {'error': 'Unknown authentication type'},
                status=status.HTTP_401_UNAUTHORIZED
            )

    def _handle_agent_heartbeat(self, request, data):
        """Handle heartbeat from an agent."""
        auth_endpoint = get_endpoint_from_request(request)

        # Verify agent_id matches
        if auth_endpoint.agent_id != data['agent_id']:
            return Response(
                {'error': 'Agent ID mismatch'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Collect endpoint updates first, then save once
        health_status = data.get('status', AgentEndpoint.Health.HEALTHY)

        endpoint_update_fields = ['updated_at', 'last_heartbeat']
        auth_endpoint.last_heartbeat = timezone.now()

        if health_status and health_status in AgentEndpoint.Health.values:
            auth_endpoint.health = health_status
            endpoint_update_fields.append('health')

        auth_endpoint.save(update_fields=endpoint_update_fields)

        # Create heartbeat event (async)
        self._create_agent_heartbeat_event(
            auth_endpoint,
            health_status,
            data.get('metrics', {}),
            data.get('config_hash'),
            data.get('secrets_hash'),
        )

        return Response(
            {'acknowledged': True},
            status=status.HTTP_202_ACCEPTED
        )

    def _create_agent_heartbeat_event(
        self,
        endpoint: AgentEndpoint,
        health: str,
        metrics: dict,
        config_hash: str = None,
        secrets_hash: str = None,
    ):
        """Create a heartbeat event for agent telemetry."""
        from zentinelle.tasks.events import process_event_batch

        payload = {
            'status': health,
            'metrics': metrics,
            'source': 'agent',
        }
        if config_hash:
            payload['config_hash'] = config_hash
        if secrets_hash:
            payload['secrets_hash'] = secrets_hash

        event = Event.objects.create(
            endpoint=endpoint,
            tenant_id=endpoint.tenant_id,
            event_type=Event.EventType.HEARTBEAT,
            event_category=Event.Category.TELEMETRY,
            payload=payload,
            occurred_at=timezone.now(),
            status=Event.Status.PENDING,
        )

        try:
            process_event_batch.apply_async(
                args=[[str(event.id)], 'telemetry'],
            )
        except Exception as e:
            logger.warning(f"Failed to queue agent heartbeat event: {e}")
