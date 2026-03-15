"""
Celery tasks for processing Zentinelle events.
"""
import logging
from celery import shared_task
from django.utils import timezone

from zentinelle.services.event_store import (
    EventEnvelope,
    DeadLetterQueue,
    event_store,
    dead_letter_queue,
)

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=5,
)
def process_event_batch(self, event_ids: list[str], category: str):
    """
    Process a batch of events.

    Args:
        event_ids: List of event UUIDs to process
        category: Event category (telemetry, audit, alert)
    """
    from zentinelle.models import Event

    logger.info(f"Processing {len(event_ids)} {category} events")

    events = Event.objects.filter(id__in=event_ids, status=Event.Status.PENDING)

    for event in events:
        try:
            event.mark_processing()
            _process_single_event(event)
            event.mark_processed()
        except Exception as e:
            logger.error(f"Failed to process event {event.id}: {e}")
            event.mark_failed(str(e))

            # Check if we should retry or move to DLQ
            if dead_letter_queue.should_retry(event):
                delay = dead_letter_queue.get_retry_delay(event.retry_count)
                logger.info(f"Scheduling retry for event {event.id} in {delay}s")
                raise  # Let Celery handle retry
            else:
                dead_letter_queue.move_to_dlq(event, str(e))


def _process_single_event(event):
    """Process a single event based on its type."""
    from zentinelle.models import Event, AgentEndpoint

    event_type = event.event_type

    # Heartbeat events - update endpoint health
    if event_type == Event.EventType.HEARTBEAT:
        if event.endpoint:
            health = event.payload.get('status', AgentEndpoint.Health.HEALTHY)
            event.endpoint.update_heartbeat(health=health)

    # Spawn/stop events - track for billing
    elif event_type in [Event.EventType.SPAWN, Event.EventType.STOP]:
        _send_to_stripe(event)

    # AI request events - track tokens for billing
    elif event_type == Event.EventType.AI_REQUEST:
        _record_ai_usage(event)
        _send_to_stripe(event)

    # Policy violation - send alerts
    elif event_type == Event.EventType.POLICY_VIOLATION:
        _send_alert(event)

    # Budget exceeded - send alerts
    elif event_type == Event.EventType.BUDGET_EXCEEDED:
        _send_alert(event)

    # Endpoint unhealthy - send alerts
    elif event_type == Event.EventType.ENDPOINT_UNHEALTHY:
        _send_alert(event)


def _send_to_stripe(event):
    """Send billable event to Stripe billing meters."""
    import stripe
    from django.conf import settings

    try:
        from billing.models import Subscription
    except ImportError:
        return  # Managed-only feature, skip in standalone mode

    stripe.api_key = getattr(settings, 'STRIPE_SECRET_KEY', '')
    if not stripe.api_key:
        return

    try:
        # Get subscription for this tenant
        if not event.tenant_id:
            return

        subscription = Subscription.objects.filter(
            organization_id=event.tenant_id,
            status__in=[Subscription.Status.ACTIVE, Subscription.Status.TRIALING]
        ).first()

        if not subscription or not subscription.stripe_customer_id:
            return

        # Determine meter event type based on event type
        from zentinelle.models import Event
        if event.event_type == Event.EventType.AI_REQUEST:
            # Track token usage
            tokens = event.payload.get('tokens', 0)
            if tokens > 0:
                stripe.billing.MeterEvent.create(
                    event_name='tokens_used',
                    payload={
                        'stripe_customer_id': subscription.stripe_customer_id,
                        'value': str(tokens),
                    },
                )
        elif event.event_type in [Event.EventType.SPAWN, Event.EventType.STOP]:
            # Track compute hours
            duration_hours = event.payload.get('duration_hours', 0)
            if duration_hours > 0:
                stripe.billing.MeterEvent.create(
                    event_name='compute_hours',
                    payload={
                        'stripe_customer_id': subscription.stripe_customer_id,
                        'value': str(int(duration_hours * 100)),  # In hundredths
                    },
                )

        # Mark event as sent to billing
        event.lago_event_id = 'stripe_sent'
        event.save(update_fields=['lago_event_id'])

    except Exception as e:
        logger.warning(f"Failed to send event to Stripe: {e}")
        # Don't fail the event processing for billing failures


def _send_alert(event):
    """Send alert notification."""
    from zentinelle.services.alert_service import AlertService

    try:
        alert_service = AlertService()
        alert_service.send_alert(event)
    except Exception as e:
        logger.warning(f"Failed to send alert: {e}")
        # Don't fail the event processing for alert failures


def _record_ai_usage(event):
    """
    Record AI usage from an AI_REQUEST event.

    Expected payload format:
    {
        "provider": "openai",
        "model": "gpt-4",
        "input_tokens": 100,
        "output_tokens": 50,
        "user_id": "user@example.com",
        "request_id": "chatcmpl-xxx",
        "latency_ms": 1500,
        "request_type": "chat",  # optional
        "input_cost_usd": 0.003,  # optional
        "output_cost_usd": 0.006,  # optional
    }
    """
    from decimal import Decimal
    try:
        from billing.models import AIUsage
    except ImportError:
        return  # Managed-only feature, skip in standalone mode

    if not event.tenant_id:
        return

    payload = event.payload or {}

    # Required fields
    provider = payload.get('provider', '').lower()
    model = payload.get('model', '')
    input_tokens = payload.get('input_tokens', 0)
    output_tokens = payload.get('output_tokens', 0)

    # User identifier from payload or event
    user_identifier = payload.get('user_id') or event.user_identifier or 'unknown'

    # Optional fields
    request_id = payload.get('request_id', '')
    latency_ms = payload.get('latency_ms')
    request_type = payload.get('request_type', 'chat')

    # Cost fields (if provided by agent, otherwise we'll calculate later)
    input_cost = Decimal(str(payload.get('input_cost_usd', 0)))
    output_cost = Decimal(str(payload.get('output_cost_usd', 0)))

    # Validate we have minimum required data
    if not provider or not model:
        logger.warning(f"AI_REQUEST event missing provider or model: {event.id}")
        return

    try:
        AIUsage.record_usage(
            organization=event.tenant_id,
            deployment=event.deployment,
            user_identifier=user_identifier,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            input_cost_usd=input_cost,
            output_cost_usd=output_cost,
            request_type=request_type,
            request_id=request_id,
            latency_ms=latency_ms,
            metadata={
                'event_id': str(event.id),
                'endpoint_id': str(event.endpoint_id) if event.endpoint_id else None,
            },
        )
        logger.debug(f"Recorded AI usage for event {event.id}")

    except Exception as e:
        logger.warning(f"Failed to record AI usage for event {event.id}: {e}")
        # Don't fail the event processing for usage tracking failures


@shared_task
def process_telemetry_event(event_id: str):
    """Process a single telemetry event."""
    process_event_batch.delay([event_id], 'telemetry')


@shared_task
def process_audit_event(event_id: str):
    """Process a single audit event."""
    process_event_batch.delay([event_id], 'audit')


@shared_task(priority=9)
def process_alert_event(event_id: str):
    """Process a single alert event with high priority."""
    process_event_batch.delay([event_id], 'alert')


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3,
)
def apply_event_projections(self, event_id: str, envelope_data: dict):
    """
    Apply registered projections to an event.

    Projections are materialized views built from events.
    """
    from zentinelle.models import Event

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

    except Exception as e:
        logger.error(f"Failed to apply projections for event {event_id}: {e}")
        raise


@shared_task
def process_dead_letter_queue(organization_id: str):
    """
    Process events in the dead letter queue.

    Attempts to reprocess failed events that may have been
    blocked by temporary issues.
    """
    from zentinelle.models import Event

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


@shared_task
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
