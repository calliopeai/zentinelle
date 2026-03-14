"""
Django signals for Zentinelle.

Connects model post_save signals to trigger asynchronous ClickHouse
streaming of audit events.
"""
import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='zentinelle.AuditLog')
def on_audit_log_created(sender, instance, created, **kwargs):
    """Stream new AuditLog records to ClickHouse asynchronously."""
    if not created:
        return

    try:
        from zentinelle.tasks.clickhouse_sync import stream_audit_log_to_clickhouse
        stream_audit_log_to_clickhouse.apply_async(
            args=[str(instance.id)],
            countdown=1,  # Small delay to ensure DB commit
        )
    except Exception as e:
        # Never block the main request cycle
        logger.debug(f"Failed to queue AuditLog ClickHouse sync: {e}")


@receiver(post_save, sender='zentinelle.Event')
def on_event_created(sender, instance, created, **kwargs):
    """Stream new Event records to ClickHouse asynchronously."""
    if not created:
        return

    try:
        from zentinelle.tasks.clickhouse_sync import stream_event_to_clickhouse
        stream_event_to_clickhouse.apply_async(
            args=[str(instance.id)],
            countdown=1,
        )
    except Exception as e:
        # Never block the main request cycle
        logger.debug(f"Failed to queue Event ClickHouse sync: {e}")
