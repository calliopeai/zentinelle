"""
Celery tasks for streaming audit events to ClickHouse.

Events are sent in batches for efficiency. The main entry points are:
- stream_audit_log_to_clickhouse: called via Django signal on AuditLog creation
- stream_event_to_clickhouse: called via Django signal on Event creation
- flush_clickhouse_buffer: periodic task to flush any buffered events

All tasks are fire-and-forget: failures are logged but never block
the main Django request cycle.
"""
import json
import logging
from datetime import datetime

from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Cache key for the event buffer
BUFFER_KEY = 'clickhouse:event_buffer'
BUFFER_LOCK_KEY = 'clickhouse:buffer_lock'
BATCH_SIZE = 100  # Flush when buffer reaches this size
BUFFER_TTL = 300  # 5 minutes max buffer age


def _build_audit_log_row(audit_log_id: str) -> dict | None:
    """Build a ClickHouse row dict from an AuditLog instance."""
    from zentinelle.models import AuditLog

    try:
        log = AuditLog.objects.get(id=audit_log_id)
    except AuditLog.DoesNotExist:
        logger.warning(f"AuditLog {audit_log_id} not found for ClickHouse sync.")
        return None

    return {
        'event_id': str(log.id),
        'event_type': log.action,
        'event_category': 'audit_log',
        'organization_id': str(log.organization_id),
        'user_id': str(log.user_id) if log.user_id else None,
        'agent_id': None,
        'action': log.action,
        'resource_type': log.resource_type,
        'resource_id': log.resource_id,
        'resource_name': log.resource_name,
        'metadata': {
            'changes': log.changes,
            'api_key_prefix': log.api_key_prefix,
            **(log.metadata or {}),
        },
        'ip_address': log.ip_address,
        'user_agent': log.user_agent,
        'correlation_id': '',
        'occurred_at': log.timestamp,
        'created_at': log.timestamp,
    }


def _build_event_row(event_id: str) -> dict | None:
    """Build a ClickHouse row dict from an Event instance."""
    from zentinelle.models import Event

    try:
        event = Event.objects.select_related('endpoint').get(id=event_id)
    except Event.DoesNotExist:
        logger.warning(f"Event {event_id} not found for ClickHouse sync.")
        return None

    agent_id = ''
    if event.endpoint:
        agent_id = event.endpoint.agent_id or ''

    return {
        'event_id': str(event.id),
        'event_type': event.event_type,
        'event_category': 'agent_event',
        'organization_id': str(event.organization_id),
        'user_id': None,
        'agent_id': agent_id,
        'action': event.event_type,
        'resource_type': 'agent_endpoint',
        'resource_id': str(event.endpoint_id) if event.endpoint_id else '',
        'resource_name': '',
        'metadata': event.payload or {},
        'ip_address': None,
        'user_agent': '',
        'correlation_id': event.correlation_id or '',
        'occurred_at': event.occurred_at,
        'created_at': event.received_at,
    }


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    ignore_result=True,
)
def stream_audit_log_to_clickhouse(self, audit_log_id: str):
    """
    Stream a single AuditLog record to ClickHouse.

    Called asynchronously after AuditLog.log() or AuditLog.log_from_request().
    """
    from zentinelle.services.clickhouse_service import is_enabled, insert_audit_events

    if not is_enabled():
        return

    row = _build_audit_log_row(audit_log_id)
    if row:
        inserted = insert_audit_events([row])
        if inserted:
            logger.debug(f"Streamed AuditLog {audit_log_id} to ClickHouse.")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    ignore_result=True,
)
def stream_event_to_clickhouse(self, event_id: str):
    """
    Stream a single Event record to ClickHouse.

    Called asynchronously after Event creation.
    """
    from zentinelle.services.clickhouse_service import is_enabled, insert_audit_events

    if not is_enabled():
        return

    row = _build_event_row(event_id)
    if row:
        inserted = insert_audit_events([row])
        if inserted:
            logger.debug(f"Streamed Event {event_id} to ClickHouse.")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    max_retries=3,
    ignore_result=True,
)
def stream_batch_to_clickhouse(self, audit_log_ids: list = None, event_ids: list = None):
    """
    Stream a batch of AuditLog and/or Event records to ClickHouse.

    More efficient than individual inserts for high-volume scenarios.
    """
    from zentinelle.services.clickhouse_service import is_enabled, insert_audit_events

    if not is_enabled():
        return

    rows = []

    for log_id in (audit_log_ids or []):
        row = _build_audit_log_row(log_id)
        if row:
            rows.append(row)

    for eid in (event_ids or []):
        row = _build_event_row(eid)
        if row:
            rows.append(row)

    if rows:
        inserted = insert_audit_events(rows)
        logger.info(
            f"Batch streamed {inserted}/{len(rows)} records to ClickHouse."
        )


@shared_task(ignore_result=True)
def backfill_clickhouse(
    days: int = 30,
    batch_size: int = 500,
    organization_id: str = None,
):
    """
    Backfill ClickHouse with historical audit events from Django DB.

    Useful for initial setup or after data loss. Processes both
    AuditLog and Event records from the last N days.
    """
    from django.utils import timezone
    from datetime import timedelta
    from zentinelle.models import AuditLog, Event
    from zentinelle.services.clickhouse_service import is_enabled, insert_audit_events

    if not is_enabled():
        logger.warning("ClickHouse not enabled; skipping backfill.")
        return

    since = timezone.now() - timedelta(days=days)

    # Backfill AuditLog records
    audit_qs = AuditLog.objects.filter(timestamp__gte=since)
    if organization_id:
        audit_qs = audit_qs.filter(organization_id=organization_id)

    audit_count = 0
    batch = []
    for log in audit_qs.iterator():
        row = {
            'event_id': str(log.id),
            'event_type': log.action,
            'event_category': 'audit_log',
            'organization_id': str(log.organization_id),
            'user_id': str(log.user_id) if log.user_id else None,
            'agent_id': None,
            'action': log.action,
            'resource_type': log.resource_type,
            'resource_id': log.resource_id,
            'resource_name': log.resource_name,
            'metadata': {
                'changes': log.changes,
                'api_key_prefix': log.api_key_prefix,
                **(log.metadata or {}),
            },
            'ip_address': log.ip_address,
            'user_agent': log.user_agent,
            'correlation_id': '',
            'occurred_at': log.timestamp,
            'created_at': log.timestamp,
        }
        batch.append(row)
        if len(batch) >= batch_size:
            audit_count += insert_audit_events(batch)
            batch = []

    if batch:
        audit_count += insert_audit_events(batch)

    # Backfill Event records
    event_qs = Event.objects.filter(occurred_at__gte=since).select_related('endpoint')
    if organization_id:
        event_qs = event_qs.filter(organization_id=organization_id)

    event_count = 0
    batch = []
    for event in event_qs.iterator():
        agent_id = ''
        if event.endpoint:
            agent_id = event.endpoint.agent_id or ''

        row = {
            'event_id': str(event.id),
            'event_type': event.event_type,
            'event_category': 'agent_event',
            'organization_id': str(event.organization_id),
            'user_id': None,
            'agent_id': agent_id,
            'action': event.event_type,
            'resource_type': 'agent_endpoint',
            'resource_id': str(event.endpoint_id) if event.endpoint_id else '',
            'resource_name': '',
            'metadata': event.payload or {},
            'ip_address': None,
            'user_agent': '',
            'correlation_id': event.correlation_id or '',
            'occurred_at': event.occurred_at,
            'created_at': event.received_at,
        }
        batch.append(row)
        if len(batch) >= batch_size:
            event_count += insert_audit_events(batch)
            batch = []

    if batch:
        event_count += insert_audit_events(batch)

    logger.info(
        f"ClickHouse backfill complete: {audit_count} audit logs, "
        f"{event_count} events ({days} days)"
    )
