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


WEBHOOK_TRIGGERS = {
    'zentinelle.ComplianceAlert': ('compliance_alert', lambda i: getattr(i, 'severity', 'medium')),
    'zentinelle.Incident': ('incident_created', lambda i: getattr(i, 'severity', 'medium')),
}


@receiver(post_save)
def auto_webhook_dispatch(sender, instance, created, **kwargs):
    if not created:
        return
    label = _get_model_label(instance)
    trigger = WEBHOOK_TRIGGERS.get(label)
    if not trigger:
        return

    event_type, severity_fn = trigger
    tenant_id = getattr(instance, 'tenant_id', '')
    if not tenant_id:
        return

    try:
        from zentinelle.services.webhook_dispatcher import dispatch_webhook
        dispatch_webhook(
            tenant_id=tenant_id,
            event_type=event_type,
            severity=severity_fn(instance),
            payload={
                'id': str(instance.pk),
                'title': getattr(instance, 'title', getattr(instance, 'name', str(instance))),
                'description': getattr(instance, 'description', ''),
            },
        )
    except Exception as e:
        logger.debug(f"Webhook dispatch failed for {label}: {e}")


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
    """Stream new Event records to ClickHouse and dispatch webhooks for policy violations."""
    if not created:
        return

    try:
        from zentinelle.tasks.clickhouse_sync import stream_event_to_clickhouse
        stream_event_to_clickhouse.apply_async(
            args=[str(instance.id)],
            countdown=1,
        )
    except Exception as e:
        logger.debug(f"Failed to queue Event ClickHouse sync: {e}")

    if instance.event_type == 'policy_violation' and instance.tenant_id:
        try:
            from zentinelle.services.webhook_dispatcher import dispatch_webhook
            dispatch_webhook(
                tenant_id=instance.tenant_id,
                event_type='policy_violation',
                severity='high',
                payload=instance.payload or {},
            )
        except Exception as e:
            logger.debug(f"Webhook dispatch failed for policy violation: {e}")


# =============================================================================
# Policy cache invalidation
# =============================================================================

# Which models change what a cached evaluation would decide. `Policy` alone:
# `PolicyEngine.evaluate` queries no other model, and its cache key is built
# from the tenant's policy version.
#
# ContentRule is deliberately not here. The content scanner keeps its rules on
# the scanner instance rather than in the shared cache, so a version bump would
# not reach it, and adding it would buy nothing but the appearance of cover.
CACHE_INVALIDATING_MODELS = {
    'zentinelle.Policy',
}


def _invalidate_policy_cache(instance):
    """Bump the tenant's policy cache version, whoever wrote the policy.

    This lives on the model rather than in the mutation because the mutation is
    not the only writer, and the ones that were not calling it are exactly the
    ones nobody would think to check: the LLM assistant creates policies through
    `services/llm_tools.py`, the Django admin saves them through a ModelAdmin,
    and a policy document applies them through its own mutation. Each of those
    left `evaluate` serving a cached decision for up to POLICY_CACHE_TTL — five
    minutes in which an agent that a new `fail_open=false` policy forbids goes
    on being allowed.

    That is a GRC failure rather than a performance one: the product's claim is
    that the policy an operator saved is the policy being enforced.

    Not deferred to `transaction.on_commit`. Bumping now can invalidate for a
    write that later rolls back, which costs one cache miss; deferring leaves a
    window between the write becoming visible to other connections and the
    version moving, which costs an enforcement decision made against rules that
    have already changed. The cheap mistake is the right one to make.

    Never raises. Invalidation runs inside somebody else's save, and a cache
    that cannot be reached is not a reason to fail the write that was already
    accepted; the TTL still bounds the staleness, which is the situation before
    this existed.
    """
    tenant_id = getattr(instance, 'tenant_id', '')
    if not tenant_id:
        return
    try:
        from zentinelle.services.policy_engine import PolicyEngine
        PolicyEngine().invalidate_cache(tenant_id)
    except Exception:
        logger.exception(
            'failed to invalidate the policy cache for tenant %s after a write to %s; '
            'evaluations may serve a stale decision until the cache entry expires',
            tenant_id,
            _get_model_label(instance),
        )


@receiver(post_save)
def invalidate_policy_cache_on_save(sender, instance, **kwargs):
    if _get_model_label(instance) in CACHE_INVALIDATING_MODELS:
        _invalidate_policy_cache(instance)


@receiver(post_delete)
def invalidate_policy_cache_on_delete(sender, instance, **kwargs):
    if _get_model_label(instance) in CACHE_INVALIDATING_MODELS:
        _invalidate_policy_cache(instance)
