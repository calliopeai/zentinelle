"""One conservative retention decision for both scheduled entry points."""
import hashlib
import json
import logging
import os
import tempfile
from contextlib import contextmanager
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


def signed_retention_manifest(tenant_id, entity, action, record_count=0, destination=''):
    """Create a tamper-evident manifest for an archive/preservation outcome."""
    from django.conf import settings
    from django.core import signing
    manifest = {
        'tenant_id': tenant_id,
        'entity_type': entity,
        'action': action,
        'record_count': int(record_count),
        'destination': destination,
        'created_at': timezone.now().isoformat(),
    }
    signature = signing.dumps(manifest, key=settings.SECRET_KEY, salt='zentinelle-retention-v1')
    digest = hashlib.sha256(signature.encode()).hexdigest()
    return {**manifest, 'signature': signature, 'digest': digest}


def verify_retention_manifest(manifest):
    """Verify signature and digest before an archive is restored or expired."""
    from django.conf import settings
    from django.core import signing
    if not isinstance(manifest, dict) or not manifest.get('signature'):
        return False
    signature = manifest['signature']
    expected_digest = hashlib.sha256(signature.encode()).hexdigest()
    if manifest.get('digest') != expected_digest:
        return False
    try:
        payload = signing.loads(signature, key=settings.SECRET_KEY, salt='zentinelle-retention-v1')
    except (signing.BadSignature, TypeError, ValueError):
        return False
    return all(payload.get(key) == manifest.get(key) for key in ('tenant_id', 'entity_type', 'action', 'record_count', 'destination', 'created_at'))


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
        if policy.expiration_action == 'archive' and policy.archive_location:
            action = 'archive'
        elif policy.expiration_action != 'delete':
            # Never substitute deletion for an archive, anonymize or review request.
            action = 'preserve_for_review'
    return max(days) if days else default_days, action


def _archive_destination(location, tenant_id, entity):
    """Return a safe local archive path for a configured destination.

    Remote transports must be implemented by an explicitly configured storage
    adapter. Silently treating an S3 URI as a local path would make deletion
    unsafe, so those destinations fail closed.
    """
    if location.startswith('file://'):
        location = location[7:]
    if '://' in location or not os.path.isabs(location):
        raise ValueError('archive_location must be an absolute local path or file:// URI')
    os.makedirs(location, mode=0o750, exist_ok=True)
    return os.path.join(location, f'{tenant_id}-{entity}-{timezone.now().strftime("%Y%m%dT%H%M%S%fZ")}.jsonl')


def _archive_records(records, location, tenant_id, entity):
    """Atomically persist records and return destination, digest and count."""
    destination = _archive_destination(location, tenant_id, entity)
    directory = os.path.dirname(destination)
    fd, temporary = tempfile.mkstemp(prefix='.zentinelle-', suffix='.tmp', dir=directory, text=True)
    digest = hashlib.sha256()
    count = 0
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            for record in records:
                payload = {}
                for field in record._meta.concrete_fields:
                    value = getattr(record, field.attname)
                    if hasattr(value, 'isoformat'):
                        value = value.isoformat()
                    payload[field.name] = value
                line = (json.dumps(payload, sort_keys=True, default=str) + '\n').encode('utf-8')
                output.buffer.write(line)
                digest.update(line)
                count += 1
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o640)
        os.replace(temporary, destination)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise
    return destination, digest.hexdigest(), count


def enforce_retention():
    from zentinelle.models import AuditLog, Event
    from zentinelle.models.compliance import ContentScan, InteractionLog
    from zentinelle.models.usage import UsageMetric
    from zentinelle.models.retention_policy import RetentionPolicy
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
                    cutoff = timezone.now() - timedelta(days=days)
                    qs = model.objects.filter(tenant_id=tenant, **{date_field + '__lt': cutoff})
                    if model is Event:
                        qs = qs.filter(status=Event.Status.PROCESSED)
                    if action == 'archive':
                        records = list(qs.order_by('pk'))
                        policy = RetentionPolicy.objects.filter(
                            tenant_id=tenant, enabled=True, entity_type__in=[entity, 'all'],
                            expiration_action='archive',
                        ).exclude(archive_location='').order_by('-priority').first()
                        try:
                            destination, checksum, archived_count = _archive_records(
                                records, policy.archive_location, tenant, entity,
                            )
                            manifest = signed_retention_manifest(tenant, entity, 'archive', archived_count, destination)
                            manifest['archive_checksum'] = checksum
                            RetentionOutcome.objects.create(
                                tenant_id=tenant, entity_type=entity,
                                status=RetentionOutcome.Status.ARCHIVED,
                                record_count=archived_count, manifest=manifest,
                                manifest_digest=manifest['digest'], destination=destination,
                            )
                            if records:
                                qs.delete()
                            continue
                        except Exception as exc:
                            RetentionOutcome.objects.create(
                                tenant_id=tenant, entity_type=entity,
                                status=RetentionOutcome.Status.FAILED, error=str(exc),
                            )
                            result['tenants_failed'] += 1
                            continue
                    if action != 'delete':
                        result['preserved_for_review'].append({'tenant_id': tenant, 'entity': entity})
                        manifest = signed_retention_manifest(tenant, entity, action)
                        RetentionOutcome.objects.create(
                            tenant_id=tenant, entity_type=entity,
                            status=RetentionOutcome.Status.PRESERVED,
                            manifest=manifest,
                            manifest_digest=manifest['digest'],
                            destination=manifest['destination'],
                        )
                        continue
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
