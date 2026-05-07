"""
Django signals for Zentinelle.

- Audit logging: auto-create AuditLog records for key model changes
- ClickHouse sync: stream audit/event records asynchronously
"""
import logging

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

AUDITED_MODELS = {
    'zentinelle.AgentEndpoint': 'endpoint',
    'zentinelle.Policy': 'policy',
    'zentinelle.ContentRule': 'content_rule',
    'zentinelle.Risk': 'risk',
    'zentinelle.Incident': 'incident',
    'zentinelle.RetentionPolicy': 'retention_policy',
    'zentinelle.LegalHold': 'legal_hold',
    'zentinelle.SystemPrompt': 'system_prompt',
}


def _get_model_label(instance):
    return f'{instance._meta.app_label}.{instance._meta.object_name}'


@receiver(post_save)
def auto_audit_log_save(sender, instance, created, **kwargs):
    label = _get_model_label(instance)
    resource_type = AUDITED_MODELS.get(label)
    if not resource_type:
        return
    if label == 'zentinelle.AuditLog':
        return

    tenant_id = getattr(instance, 'tenant_id', '')
    if not tenant_id:
        return

    try:
        from zentinelle.models.audit import AuditLog
        AuditLog.objects.create(
            tenant_id=tenant_id,
            action=AuditLog.Action.CREATE if created else AuditLog.Action.UPDATE,
            resource_type=resource_type,
            resource_id=str(instance.pk),
            resource_name=str(getattr(instance, 'name', ''))[:255],
        )
    except Exception as e:
        logger.debug(f"Auto audit log failed for {label}: {e}")


@receiver(post_delete)
def auto_audit_log_delete(sender, instance, **kwargs):
    label = _get_model_label(instance)
    resource_type = AUDITED_MODELS.get(label)
    if not resource_type:
        return

    tenant_id = getattr(instance, 'tenant_id', '')
    if not tenant_id:
        return

    try:
        from zentinelle.models.audit import AuditLog
        AuditLog.objects.create(
            tenant_id=tenant_id,
            action=AuditLog.Action.DELETE,
            resource_type=resource_type,
            resource_id=str(instance.pk),
            resource_name=str(getattr(instance, 'name', ''))[:255],
        )
    except Exception as e:
        logger.debug(f"Auto audit log delete failed for {label}: {e}")


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
