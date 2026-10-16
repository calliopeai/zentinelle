"""
Background tasks for processing Zentinelle events.
"""
import logging
from datetime import timedelta

from django.db.models import F
from django.utils import timezone

from zentinelle.services.event_store import (EventEnvelope, dead_letter_queue,
                                             event_store)
from zentinelle.temporal.client import start_task
from zentinelle.temporal.registry import task

logger = logging.getLogger(__name__)


@task(retries=5)
def process_event_batch(event_ids: list[str], category: str):
    """
    Process a batch of events.

    Args:
        event_ids: List of event UUIDs to process
        category: Event category (telemetry, audit, alert)
    """
    from zentinelle.models import Event
    from zentinelle.services.usage_ingest import InvalidUsage

    logger.info(f"Processing {len(event_ids)} {category} events")

    events = Event.objects.filter(id__in=event_ids, status=Event.Status.PENDING)

    for event in events:
        try:
            event.mark_processing()
            _process_single_event(event)
            event.mark_processed()
        except InvalidUsage as e:
            # The same payload fails the same way on every retry, so it goes
            # straight to the DLQ rather than through five retries.
            logger.warning(f"Rejected usage event {event.id}: {e}")
            event.retry_count = dead_letter_queue.MAX_RETRIES
            dead_letter_queue.move_to_dlq(event, f"Invalid usage: {e}")
        except Exception as e:
            logger.error(f"Failed to process event {event.id}: {e}")
            event.mark_failed(str(e))

            # Check if we should retry or move to DLQ
            if dead_letter_queue.should_retry(event):
                delay = dead_letter_queue.get_retry_delay(event.retry_count)
                logger.info(f"Scheduling retry for event {event.id} in {delay}s")
                raise  # Let the activity retry policy handle it
            else:
                dead_letter_queue.move_to_dlq(event, str(e))


def _process_single_event(event):
    """Process a single event based on its type."""
    from zentinelle.models import AgentEndpoint, Event
    from zentinelle.services.usage_ingest import (USAGE_EVENT_TYPES,
                                                  carries_tokens,
                                                  record_usage_event)

    event_type = event.event_type

    # Heartbeat events - update endpoint health
    if event_type == Event.EventType.HEARTBEAT:
        if event.endpoint:
            health = event.payload.get('status', AgentEndpoint.Health.HEALTHY)
            event.endpoint.update_heartbeat(health=health)

    # Usage events, under every producer's name. A failure here must fail the
    # event: swallowing it marked the usage processed and lost it.
    elif event_type in USAGE_EVENT_TYPES:
        record_usage_event(event)

    # Policy violation - send alerts
    elif event_type == Event.EventType.POLICY_VIOLATION:
        _send_alert(event)

    # Budget exceeded - send alerts
    elif event_type == Event.EventType.BUDGET_EXCEEDED:
        _send_alert(event)

    # Endpoint unhealthy - send alerts
    elif event_type == Event.EventType.ENDPOINT_UNHEALTHY:
        _send_alert(event)

    # Everything else is stored for audit only. Token counts under another
    # type are not metered, which is the silent loss to make visible.
    elif carries_tokens(event.payload):
        logger.warning(
            f"Event {event.id} of type {event_type!r} carries token counts but is not a "
            f"usage type ({', '.join(sorted(USAGE_EVENT_TYPES))}); not metered"
        )


def _send_alert(event):
    """Send alert notification."""
    from zentinelle.services.alert_service import AlertService

    try:
        alert_service = AlertService()
        alert_service.send_alert(event)
    except Exception as e:
        logger.warning(f"Failed to send alert: {e}")
        # Don't fail the event processing for alert failures


@task
def process_telemetry_event(event_id: str):
    """Process a single telemetry event."""
    start_task(process_event_batch, [event_id], 'telemetry', workflow_id=event_id)


@task
def process_audit_event(event_id: str):
    """Process a single audit event."""
    start_task(process_event_batch, [event_id], 'audit', workflow_id=event_id)


@task
def process_alert_event(event_id: str):
    """Process a single alert event with high priority."""
    start_task(process_event_batch, [event_id], 'alert', workflow_id=event_id)


@task(retries=3)
def apply_event_projections(event_id: str, envelope_data: dict, outbox_id: str = None):
    """
    Apply registered projections to an event.

    Projections are materialized views built from events.
    """

    try:
        envelope = EventEnvelope.from_dict(envelope_data)

        # Apply all registered projections
        for name, handler in event_store._projections.items():
            try:
                handler(envelope)
                logger.debug(f"Applied projection {name} to event {event_id}")
            except Exception as e:
                logger.error(f"Projection {name} failed for event {event_id}: {e}")
                # Continue with other projections

        if outbox_id:
            from zentinelle.models import EventDeliveryOutbox
            EventDeliveryOutbox.objects.filter(id=outbox_id).update(
                status=EventDeliveryOutbox.Status.DELIVERED,
                delivered_at=timezone.now(), attempts=F('attempts') + 1,
            )
    except Exception as e:
        if outbox_id:
            from zentinelle.models import EventDeliveryOutbox
            row = EventDeliveryOutbox.objects.filter(id=outbox_id).first()
            if row:
                row.attempts += 1
                row.last_error = str(e)
                if row.attempts >= 5:
                    row.status = EventDeliveryOutbox.Status.DEAD_LETTER
                else:
                    row.status = EventDeliveryOutbox.Status.PENDING
                    row.next_attempt_at = timezone.now() + timedelta(minutes=min(60, 2 ** row.attempts))
                row.save(update_fields=['status', 'attempts', 'last_error', 'next_attempt_at'])
        logger.error(f"Failed to apply projections for event {event_id}: {e}")
        raise


@task
def dispatch_event_outbox(limit: int = 100):
    """Requeue due durable projection deliveries after broker interruptions."""
    from zentinelle.models import EventDeliveryOutbox
    now = timezone.now()
    rows = list(EventDeliveryOutbox.objects.filter(
        status__in=(EventDeliveryOutbox.Status.PENDING, EventDeliveryOutbox.Status.QUEUED),
        next_attempt_at__lte=now, attempts__lt=5,
    ).order_by('created_at')[:max(1, min(int(limit), 500))])
    dispatched = 0
    for row in rows:
        try:
            row.attempts += 1
            row.status = EventDeliveryOutbox.Status.QUEUED
            row.next_attempt_at = now + timedelta(minutes=min(60, 2 ** row.attempts))
            row.save(update_fields=['attempts', 'status', 'next_attempt_at'])
            start_task(apply_event_projections, str(row.event_id), row.envelope, str(row.id), workflow_id=str(row.id))
            dispatched += 1
        except Exception as exc:
            row.status = EventDeliveryOutbox.Status.PENDING
            row.last_error = str(exc)
            row.save(update_fields=['status', 'last_error'])
    return {'dispatched': dispatched, 'scanned': len(rows)}


@task
def process_dead_letter_queue(organization_id: str):
    """
    Process events in the dead letter queue.

    Attempts to reprocess failed events that may have been
    blocked by temporary issues.
    """

    tenant_id = organization_id

    dlq_events = dead_letter_queue.get_dlq_events(tenant_id, limit=50)
    reprocessed = 0
    failed = 0

    for event in dlq_events:
        if dead_letter_queue.reprocess(event):
            reprocessed += 1
        else:
            failed += 1

    logger.info(
        f"DLQ processing for tenant {tenant_id}: "
        f"{reprocessed} reprocessed, {failed} failed"
    )


@task
def replay_events_for_projection(
    organization_id: str,
    projection_name: str,
    from_timestamp: str = None,
    to_timestamp: str = None,
):
    """
    Replay events through a specific projection.

    Used to rebuild materialized views from scratch or
    after deploying new projection logic.
    """
    from datetime import datetime

    tenant_id = organization_id

    handler = event_store._projections.get(projection_name)
    if not handler:
        logger.error(f"Projection {projection_name} not found")
        return

    from_dt = None
    to_dt = None
    if from_timestamp:
        from_dt = datetime.fromisoformat(from_timestamp)
    if to_timestamp:
        to_dt = datetime.fromisoformat(to_timestamp)

    count = event_store.replay(
        organization=tenant_id,
        from_timestamp=from_dt,
        to_timestamp=to_dt,
        handler=handler,
    )

    logger.info(
        f"Replayed {count} events through projection {projection_name} "
        f"for tenant {tenant_id}"
    )
