"""
Agent events endpoint.
POST /api/zentinelle/v1/events
"""
import logging
import uuid

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import (ZentinelleAPIKeyAuthentication,
                                 get_endpoint_from_request)
from zentinelle.api.serializers import EventsRequestSerializer
from zentinelle.models import Event
from zentinelle.services.content_capture import capture_payload

logger = logging.getLogger(__name__)


class EventsView(APIView):
    """
    Ingest batch of events from an agent.

    Events are validated, queued for async processing, and
    a 202 Accepted is returned immediately.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    MAX_BATCH_SIZE = 1000

    def post(self, request):
        serializer = EventsRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if len(data['events']) > self.MAX_BATCH_SIZE:
            return Response(
                {'error': f'Batch too large: max {self.MAX_BATCH_SIZE} events per request'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        # Create event records. Producer IDs opt a delivery into durable
        # deduplication; legacy events without one retain the old fast path.
        event_objects = []
        idempotent_events = []
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
                payload=capture_payload(event_data.get('payload', {}), auth_endpoint.tenant_id),
                user_identifier=event_data.get('user_id', ''),
                occurred_at=occurred_at,
                status=Event.Status.PENDING,
                correlation_id=batch_id,
                producer_event_id=event_data.get('event_id', ''),
            )
            if event.producer_event_id:
                idempotent_events.append((event, event_data))
            else:
                event_objects.append(event)

        # Bulk create legacy events, then claim producer IDs individually so
        # get_or_create can safely resolve concurrent retries through the
        # database uniqueness constraint.
        created_events = Event.objects.bulk_create(event_objects)
        duplicates = 0
        conflicts = []
        for event, _event_data in idempotent_events:
            with transaction.atomic():
                existing, created = Event.objects.get_or_create(
                    tenant_id=event.tenant_id,
                    endpoint=event.endpoint,
                    producer_event_id=event.producer_event_id,
                    defaults={
                        'deployment_id_ext': event.deployment_id_ext,
                        'event_type': event.event_type,
                        'event_category': event.event_category,
                        'payload': event.payload,
                        'user_identifier': event.user_identifier,
                        'occurred_at': event.occurred_at,
                        'status': event.status,
                        'correlation_id': event.correlation_id,
                    },
                )
            if created:
                created_events.append(existing)
            elif self._event_changed(existing, event):
                conflicts.append(event.producer_event_id)
            else:
                duplicates += 1

        if conflicts:
            return Response(
                {'error': 'Producer event ID was reused with different event data',
                 'event_ids': conflicts},
                status=status.HTTP_409_CONFLICT,
            )

        # Queue events for async processing
        self._queue_events(created_events)

        logger.info(
            f"Accepted {len(created_events)} events from {auth_endpoint.agent_id}, batch={batch_id}"
        )

        return Response(
            {
                'accepted': len(created_events),
                'duplicates': duplicates,
                'batch_id': batch_id,
            },
            status=status.HTTP_202_ACCEPTED
        )

    @staticmethod
    def _event_changed(existing: Event, incoming: Event) -> bool:
        """Reject an ID reuse that carries different event content."""
        return any((
            existing.event_type != incoming.event_type,
            existing.event_category != incoming.event_category,
            existing.user_identifier != incoming.user_identifier,
            existing.occurred_at != incoming.occurred_at,
            existing.payload != incoming.payload,
        ))

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
