"""
Event Store Service - Event Sourcing for Audit Logs.

Provides:
1. Append-only event persistence
2. Event versioning for schema evolution
3. Dead letter queue for failed processing
4. Event replay and projection capabilities
5. Snapshot support for faster replays
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Generator, Callable
from dataclasses import dataclass, asdict
from enum import Enum

from django.db import transaction
from django.utils import timezone
from django.core.cache import cache

logger = logging.getLogger(__name__)


class EventVersion(Enum):
    """Event schema versions for evolution."""
    V1 = 1  # Initial version
    V2 = 2  # Added metadata.source field


@dataclass
class EventEnvelope:
    """
    Envelope wrapping event data with metadata.
    Enables event versioning and tracing.
    """
    event_id: str
    event_type: str
    category: str
    version: int
    aggregate_id: str  # Resource being tracked (endpoint_id, config_id, etc)
    aggregate_type: str  # Type of aggregate (endpoint, policy, etc)
    sequence_number: int  # Order within aggregate stream
    correlation_id: str
    causation_id: Optional[str]  # Event that caused this one
    timestamp: datetime
    payload: Dict[str, Any]
    metadata: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'EventEnvelope':
        """Reconstruct from dictionary."""
        if isinstance(data['timestamp'], str):
            data['timestamp'] = datetime.fromisoformat(data['timestamp'])
        return cls(**data)


class EventStore:
    """
    Event store implementing event sourcing patterns.

    Events are immutable and append-only. The store maintains:
    - Global event log (ordered by timestamp)
    - Per-aggregate streams (ordered by sequence number)
    - Projections (materialized views from events)
    """

    # Cache keys
    SEQUENCE_KEY_PREFIX = 'eventstore:seq:'
    SNAPSHOT_KEY_PREFIX = 'eventstore:snapshot:'

    def __init__(self):
        self._projections: Dict[str, Callable] = {}

    def append(
        self,
        event_type: str,
        category: str,
        aggregate_id: str,
        aggregate_type: str,
        payload: Dict[str, Any],
        organization,
        endpoint=None,
        user=None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> 'EventEnvelope':
        """
        Append an event to the store.

        This is the primary write operation - events are immutable
        once appended.
        """
        from zentinelle.models import Event

        # Generate IDs
        event_id = str(uuid.uuid4())
        if not correlation_id:
            correlation_id = event_id

        # Get next sequence number for this aggregate
        sequence_number = self._next_sequence(aggregate_type, aggregate_id)

        # Build metadata
        event_metadata = metadata or {}
        event_metadata.update({
            'source': 'event_store',
            'aggregate_type': aggregate_type,
            'aggregate_id': aggregate_id,
            'sequence_number': sequence_number,
        })

        # Create envelope
        envelope = EventEnvelope(
            event_id=event_id,
            event_type=event_type,
            category=category,
            version=EventVersion.V2.value,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
            sequence_number=sequence_number,
            correlation_id=correlation_id,
            causation_id=causation_id,
            timestamp=timezone.now(),
            payload=payload,
            metadata=event_metadata,
        )

        # Persist to Event model
        with transaction.atomic():
            event = Event.objects.create(
                organization=organization,
                endpoint=endpoint,
                deployment=endpoint.deployment if endpoint else None,
                event_type=event_type,
                event_category=category,
                payload={
                    'envelope': envelope.to_dict(),
                    'data': payload,
                },
                occurred_at=envelope.timestamp,
                user_identifier=str(user.id) if user else '',
                correlation_id=correlation_id,
                status=Event.Status.PENDING,
            )

            # Update sequence cache
            self._update_sequence(aggregate_type, aggregate_id, sequence_number)

            logger.debug(
                f"Appended event {event_id} to stream {aggregate_type}:{aggregate_id}"
            )

        # Trigger projections asynchronously
        self._apply_projections_async(envelope, event)

        return envelope

    def get_stream(
        self,
        aggregate_type: str,
        aggregate_id: str,
        from_sequence: int = 0,
        to_sequence: Optional[int] = None,
    ) -> Generator[EventEnvelope, None, None]:
        """
        Read events for a specific aggregate stream.

        Used for rebuilding aggregate state from events.
        """
        from zentinelle.models import Event

        query = Event.objects.filter(
            payload__envelope__aggregate_type=aggregate_type,
            payload__envelope__aggregate_id=aggregate_id,
            payload__envelope__sequence_number__gte=from_sequence,
        ).order_by('payload__envelope__sequence_number')

        if to_sequence is not None:
            query = query.filter(
                payload__envelope__sequence_number__lte=to_sequence
            )

        for event in query.iterator():
            envelope_data = event.payload.get('envelope', {})
            if envelope_data:
                yield EventEnvelope.from_dict(envelope_data)

    def get_events_by_correlation(
        self,
        correlation_id: str,
    ) -> List[EventEnvelope]:
        """Get all events in a correlation chain."""
        from zentinelle.models import Event

        events = Event.objects.filter(
            correlation_id=correlation_id
        ).order_by('occurred_at')

        return [
            EventEnvelope.from_dict(e.payload.get('envelope', {}))
            for e in events
            if e.payload.get('envelope')
        ]

    def replay(
        self,
        organization,
        from_timestamp: Optional[datetime] = None,
        to_timestamp: Optional[datetime] = None,
        event_types: Optional[List[str]] = None,
        categories: Optional[List[str]] = None,
        handler: Optional[Callable[[EventEnvelope], None]] = None,
    ) -> int:
        """
        Replay events through a handler.

        Used for:
        - Rebuilding projections
        - Migrating to new event handlers
        - Debugging and auditing
        """
        from zentinelle.models import Event

        query = Event.objects.filter(organization=organization)

        if from_timestamp:
            query = query.filter(occurred_at__gte=from_timestamp)
        if to_timestamp:
            query = query.filter(occurred_at__lte=to_timestamp)
        if event_types:
            query = query.filter(event_type__in=event_types)
        if categories:
            query = query.filter(event_category__in=categories)

        query = query.order_by('occurred_at')

        count = 0
        for event in query.iterator():
            envelope_data = event.payload.get('envelope')
            if envelope_data and handler:
                envelope = EventEnvelope.from_dict(envelope_data)
                handler(envelope)
            count += 1

        logger.info(f"Replayed {count} events for org {organization.id}")
        return count

    def save_snapshot(
        self,
        aggregate_type: str,
        aggregate_id: str,
        state: Dict[str, Any],
        sequence_number: int,
    ):
        """
        Save a snapshot of aggregate state.

        Snapshots speed up replay by providing a known-good state
        to start from instead of replaying all events.
        """
        snapshot_key = f"{self.SNAPSHOT_KEY_PREFIX}{aggregate_type}:{aggregate_id}"
        cache.set(
            snapshot_key,
            {
                'state': state,
                'sequence_number': sequence_number,
                'timestamp': timezone.now().isoformat(),
            },
            timeout=86400 * 7,  # 7 days
        )

    def get_snapshot(
        self,
        aggregate_type: str,
        aggregate_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get latest snapshot for an aggregate."""
        snapshot_key = f"{self.SNAPSHOT_KEY_PREFIX}{aggregate_type}:{aggregate_id}"
        return cache.get(snapshot_key)

    def rebuild_aggregate(
        self,
        aggregate_type: str,
        aggregate_id: str,
        apply_event: Callable[[Dict[str, Any], EventEnvelope], Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Rebuild aggregate state from events.

        Uses snapshot if available, then applies subsequent events.
        """
        # Try to load from snapshot
        snapshot = self.get_snapshot(aggregate_type, aggregate_id)
        if snapshot:
            state = snapshot['state']
            from_sequence = snapshot['sequence_number'] + 1
        else:
            state = {}
            from_sequence = 0

        # Apply events from snapshot point forward
        for envelope in self.get_stream(aggregate_type, aggregate_id, from_sequence):
            state = apply_event(state, envelope)

        return state

    def register_projection(
        self,
        name: str,
        handler: Callable[[EventEnvelope], None],
    ):
        """
        Register a projection handler.

        Projections are materialized views built from events.
        They're updated asynchronously as events are appended.
        """
        self._projections[name] = handler
        logger.info(f"Registered projection: {name}")

    def _next_sequence(self, aggregate_type: str, aggregate_id: str) -> int:
        """Get next sequence number for aggregate stream."""
        key = f"{self.SEQUENCE_KEY_PREFIX}{aggregate_type}:{aggregate_id}"
        seq = cache.get(key, 0)
        return seq + 1

    def _update_sequence(self, aggregate_type: str, aggregate_id: str, seq: int):
        """Update cached sequence number."""
        key = f"{self.SEQUENCE_KEY_PREFIX}{aggregate_type}:{aggregate_id}"
        cache.set(key, seq, timeout=86400 * 30)  # 30 days

    def _apply_projections_async(self, envelope: EventEnvelope, event):
        """Queue projection updates for async processing."""
        from zentinelle.tasks.events import apply_event_projections

        try:
            apply_event_projections.apply_async(
                args=[str(event.id), envelope.to_dict()],
            )
        except Exception as e:
            logger.warning(f"Failed to queue projection: {e}")


class DeadLetterQueue:
    """
    Dead letter queue for failed event processing.

    Events that fail processing multiple times are moved here
    for manual inspection and reprocessing.
    """

    MAX_RETRIES = 5
    RETRY_DELAYS = [60, 300, 900, 3600, 86400]  # 1m, 5m, 15m, 1h, 1d

    def __init__(self):
        pass

    def should_retry(self, event) -> bool:
        """Check if event should be retried."""
        return event.retry_count < self.MAX_RETRIES

    def get_retry_delay(self, retry_count: int) -> int:
        """Get delay before next retry (exponential backoff)."""
        if retry_count < len(self.RETRY_DELAYS):
            return self.RETRY_DELAYS[retry_count]
        return self.RETRY_DELAYS[-1]

    def move_to_dlq(self, event, error: str):
        """Move event to dead letter queue."""
        from zentinelle.models import Event

        event.status = Event.Status.FAILED
        event.error_message = error
        event.payload['dlq'] = {
            'moved_at': timezone.now().isoformat(),
            'reason': error,
            'original_status': event.status,
        }
        event.save()

        logger.error(f"Event {event.id} moved to DLQ: {error}")

    def get_dlq_events(
        self,
        organization,
        limit: int = 100,
    ):
        """Get events in dead letter queue."""
        from zentinelle.models import Event

        return Event.objects.filter(
            organization=organization,
            status=Event.Status.FAILED,
            retry_count__gte=self.MAX_RETRIES,
        ).order_by('-received_at')[:limit]

    def reprocess(self, event) -> bool:
        """Attempt to reprocess a DLQ event."""
        from zentinelle.models import Event
        from zentinelle.tasks.events import process_event_batch

        event.status = Event.Status.PENDING
        event.retry_count = 0
        event.error_message = ''
        if 'dlq' in event.payload:
            del event.payload['dlq']
        event.save()

        try:
            process_event_batch.apply_async(
                args=[[str(event.id)], event.event_category],
            )
            return True
        except Exception as e:
            logger.error(f"Failed to requeue event {event.id}: {e}")
            return False


class AuditLogProjection:
    """
    Projection that builds audit log views from events.

    Materializes admin actions for fast querying.
    """

    def __init__(self):
        self.event_store = EventStore()

    def handle_event(self, envelope: EventEnvelope):
        """Process an event for the audit log projection."""
        from zentinelle.models import AuditLog

        # Only process audit category events
        if envelope.category != 'audit':
            return

        # Map event types to audit actions
        action_map = {
            'config_change': AuditLog.Action.UPDATE,
            'spawn': AuditLog.Action.CREATE,
            'stop': AuditLog.Action.DELETE,
            'secret_access': AuditLog.Action.ACCESS,
            'login': AuditLog.Action.LOGIN,
            'logout': AuditLog.Action.LOGOUT,
        }

        action = action_map.get(envelope.event_type)
        if not action:
            return

        # Extract audit data from payload
        payload = envelope.payload
        changes = payload.get('changes', {})
        metadata = envelope.metadata.copy()
        metadata['event_id'] = envelope.event_id
        metadata['correlation_id'] = envelope.correlation_id

        # Get organization from event
        from zentinelle.models import Event
        event = Event.objects.filter(correlation_id=envelope.correlation_id).first()
        if not event or not event.organization:
            return

        # Create audit log entry
        AuditLog.log(
            organization=event.organization,
            action=action,
            resource_type=envelope.aggregate_type,
            resource_id=envelope.aggregate_id,
            resource_name=payload.get('resource_name', ''),
            user=None,  # Could look up from user_identifier
            api_key_prefix=payload.get('api_key_prefix', ''),
            ip_address=payload.get('ip_address'),
            user_agent=payload.get('user_agent', ''),
            changes=changes,
            metadata=metadata,
        )


# Global instances
event_store = EventStore()
dead_letter_queue = DeadLetterQueue()
audit_projection = AuditLogProjection()

# Register audit projection
event_store.register_projection('audit_log', audit_projection.handle_event)
