"""One conservative retention decision for both scheduled entry points."""
import hashlib
import logging
from contextlib import contextmanager
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


@contextmanager
def tenant_retention_lock(tenant_id):
    """Serialize hold changes with cleanup across the deployment's SQL schemas."""
    from django.db import connections, transaction
    lock_id = int.from_bytes(hashlib.sha256(('retention:' + tenant_id).encode()).digest()[:8], 'big', signed=True)
    with transaction.atomic(using='default'):
        with connections['default'].cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [lock_id])
        yield


def held(tenant_id):
    from zentinelle.models.retention_policy import LegalHold
    now = timezone.now()
    # Scoped holds protect the entire tenant until record-level scope is proven.
    return LegalHold.objects.filter(tenant_id=tenant_id, status='active', effective_date__lte=now).filter(
        Q(expiration_date__isnull=True) | Q(expiration_date__gt=now)
    ).exists()


def retention_decision(tenant_id, entity, default_days):
    from zentinelle.models import Policy
    from zentinelle.models.retention_policy import RetentionPolicy
    config_key = {'events': 'event_retention_days', 'audit_logs': 'audit_log_retention_days',
                  'interactions': 'interaction_retention_days', 'scans': 'scan_retention_days',
                  'usage_data': 'usage_retention_days'}[entity]
    days = []
    for policy in Policy.objects.filter(tenant_id=tenant_id, policy_type='data_retention', enabled=True, enforcement='enforce'):
        value = policy.config.get(config_key)
        if value is not None:
            days.append(max(1, int(value), int(policy.config.get('minimum_retention_days', 0))))
    action = 'delete'
    for policy in RetentionPolicy.objects.filter(tenant_id=tenant_id, enabled=True, entity_type__in=[entity, 'all']):
        days.append(max(1, policy.get_effective_retention_days()))
        if policy.expiration_action != 'delete':
            # Never substitute deletion for an archive, anonymize or review request.
            action = 'preserve_for_review'
    return max(days) if days else default_days, action


def enforce_retention():
    from zentinelle.models import AuditLog, Event
    from zentinelle.models.compliance import ContentScan, InteractionLog
    from zentinelle.models.usage import UsageMetric
    from zentinelle.services.audit_chain import prune_audit_prefix
    models = [(Event, 'events', 'occurred_at', 90), (AuditLog, 'audit_logs', 'timestamp', 365),
              (InteractionLog, 'interactions', 'occurred_at', 90), (ContentScan, 'scans', 'created_at', 90), (UsageMetric, 'usage_data', 'occurred_at', 365)]
    from zentinelle.services.clickhouse_service import (
        disable_automatic_retention, retain_analytics, retention_tenants)
    analytics = disable_automatic_retention()
    tenants = retention_tenants(analytics)
    for model, *_ in models:
        tenants.update(model.objects.order_by().values_list('tenant_id', flat=True).distinct())
    from zentinelle.models import RetentionOutcome
    result = {'events_deleted': 0, 'audit_logs_deleted': 0, 'interactions_deleted': 0,
              'scans_deleted': 0, 'usage_data_deleted': 0, 'tenants_failed': 0, 'tenants_held': 0, 'preserved_for_review': []}
    for tenant in sorted(tenants):
        try:
            with tenant_retention_lock(tenant):
                if held(tenant):
                    result['tenants_held'] += 1
                    RetentionOutcome.objects.create(tenant_id=tenant, entity_type='all', status=RetentionOutcome.Status.HELD)
                    continue
                for model, entity, date_field, default in models:
                    days, action = retention_decision(tenant, entity, default)
                    if action != 'delete':
                        result['preserved_for_review'].append({'tenant_id': tenant, 'entity': entity})
                        RetentionOutcome.objects.create(
                            tenant_id=tenant, entity_type=entity,
                            status=RetentionOutcome.Status.PRESERVED,
                            manifest={'reason': 'retention_action_requires_external_preservation', 'action': action},
                        )
                        continue
                    cutoff = timezone.now() - timedelta(days=days)
                    if model is AuditLog:
                        deleted = prune_audit_prefix(tenant, cutoff)
                    else:
                        qs = model.objects.filter(tenant_id=tenant, **{date_field + '__lt': cutoff})
                        if model is Event:
                            qs = qs.filter(status=Event.Status.PROCESSED)
                            # Audit-category events get at least the audit retention window.
                            audit_days, audit_action = retention_decision(tenant, 'audit_logs', 365)
                            audit_cutoff = timezone.now() - timedelta(days=max(days, audit_days))
                            qs = qs.exclude(event_category='audit') | qs.filter(event_category='audit', occurred_at__lt=audit_cutoff) if audit_action == 'delete' else qs.exclude(event_category='audit')
                        deleted, _ = qs.delete()
                    result[entity + '_deleted'] += deleted
                    RetentionOutcome.objects.create(
                        tenant_id=tenant, entity_type=entity,
                        status=RetentionOutcome.Status.DELETED, record_count=deleted,
                    )
                if analytics is not None:
                    event_days, event_action = retention_decision(tenant, 'events', 90)
                    audit_days, audit_action = retention_decision(tenant, 'audit_logs', 365)
                    if event_action == audit_action == 'delete':
                        retain_analytics(analytics, tenant, timezone.now() - timedelta(days=max(event_days, audit_days)))
        except Exception:
            logger.exception('Retention failed for tenant %s; remaining records preserved', tenant)
            result['tenants_failed'] += 1
    return result
