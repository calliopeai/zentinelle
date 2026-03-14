"""
Agent events endpoint.
POST /api/zentinelle/v1/events
"""
import uuid
import logging
from datetime import datetime

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from zentinelle.models import AgentEndpoint, Event
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request
from zentinelle.api.serializers import EventsRequestSerializer

logger = logging.getLogger(__name__)


class EventsView(APIView):
    """
    Ingest batch of events from an agent.

    Events are validated, queued for async processing, and
    a 202 Accepted is returned immediately.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EventsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get authenticated endpoint
        auth_endpoint = get_endpoint_from_request(request)

        # Verify agent_id matches
        if auth_endpoint.agent_id != data['agent_id']:
            return Response(
                {'error': 'Agent ID mismatch'},
                status=status.HTTP_403_FORBIDDEN
            )

        events = data['events']
        batch_id = f"batch_{uuid.uuid4().hex[:16]}"

        # Create event records
        event_objects = []
        for event_data in events:
            occurred_at = event_data['timestamp']
            if isinstance(occurred_at, str):
                occurred_at = parse_datetime(occurred_at) or timezone.now()

            event = Event(
                tenant_id=auth_endpoint.tenant_id,
                endpoint=auth_endpoint,
                deployment_id_ext=auth_endpoint.deployment_id_ext,
                event_type=event_data['type'],
                event_category=event_data.get('category', Event.Category.TELEMETRY),
                payload=event_data.get('payload', {}),
                user_identifier=event_data.get('user_id', ''),
                occurred_at=occurred_at,
                status=Event.Status.PENDING,
                correlation_id=batch_id,
            )
            event_objects.append(event)

        # Bulk create events
        created_events = Event.objects.bulk_create(event_objects)

        # Queue events for async processing
        self._queue_events(created_events)

        logger.info(
            f"Accepted {len(created_events)} events from {auth_endpoint.agent_id}, batch={batch_id}"
        )

        return Response(
            {
                'accepted': len(created_events),
                'batch_id': batch_id,
            },
            status=status.HTTP_202_ACCEPTED
        )

    def _queue_events(self, events: list[Event]):
        """Queue events for async processing via Celery."""
        from zentinelle.tasks.events import process_event_batch

        # Group by category for routing to appropriate queues
        telemetry_ids = []
        audit_ids = []
        alert_ids = []

        for event in events:
            event_id = str(event.id)
            if event.event_category == Event.Category.TELEMETRY:
                telemetry_ids.append(event_id)
            elif event.event_category == Event.Category.AUDIT:
                audit_ids.append(event_id)
            elif event.event_category == Event.Category.ALERT:
                alert_ids.append(event_id)

        # Queue each batch to appropriate queue (gracefully handle if queue unavailable)
        try:
            if telemetry_ids:
                process_event_batch.apply_async(
                    args=[telemetry_ids, 'telemetry'],
                )

            if audit_ids:
                process_event_batch.apply_async(
                    args=[audit_ids, 'audit'],
                )

            if alert_ids:
                process_event_batch.apply_async(
                    args=[alert_ids, 'alert'],
                )
        except Exception as e:
            logger.warning(f"Failed to queue events for processing: {e}")
