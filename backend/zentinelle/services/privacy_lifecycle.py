"""Explicit tenant privacy erasure with hold-aware cross-store accounting."""
import os
import hashlib
import json
import secrets
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from zentinelle.services.retention import (held, tenant_retention_lock,
                                            verify_retention_manifest)

_REMOTE_ERASURE_ADAPTERS = {}


def _secure_delete_file(path):
    """Best-effort cryptographic erasure for a local regular archive file."""
    try:
        if os.path.islink(path) or not os.path.isfile(path):
            raise RuntimeError('Local archive cryptographic erasure requires a regular file')
        size = os.path.getsize(path)
        with open(path, 'r+b', buffering=0) as archive:
            remaining = size
            while remaining:
                chunk = min(1024 * 1024, remaining)
                archive.write(secrets.token_bytes(chunk))
                remaining -= chunk
            archive.flush()
            os.fsync(archive.fileno())
            archive.truncate(0)
            archive.flush()
            os.fsync(archive.fileno())
        os.unlink(path)
    except FileNotFoundError:
        pass
    except OSError as exc:
        raise RuntimeError('Local archive cryptographic erasure failed') from exc


def register_remote_erasure_adapter(scheme, callback):
    """Register an authenticated provider erasure callback for a URI scheme."""
    scheme = str(scheme or '').lower().strip()
    if not scheme or not callable(callback):
        raise ValueError('remote erasure adapter requires a scheme and callable')
    _REMOTE_ERASURE_ADAPTERS[scheme] = callback


def clear_remote_erasure_adapters():
    _REMOTE_ERASURE_ADAPTERS.clear()


def restore_archive(manifest, tenant_id, *, actor='privacy-operator', commit=False):
    """Preview or restore a verified local archive into its known model."""
    tenant_id = str(tenant_id)
    if not verify_retention_manifest(manifest) or str(manifest.get('tenant_id')) != tenant_id:
        raise ValueError('Invalid or cross-tenant retention manifest')
    destination = str(manifest.get('destination') or '')
    if destination.startswith('file://'):
        destination = destination[7:]
    if '://' in destination or not os.path.isabs(destination):
        raise ValueError('Archive restore requires an absolute local destination')
    entities = {'events': 'Event', 'audit_logs': 'AuditLog', 'interactions': 'InteractionLog', 'scans': 'ContentScan', 'usage_data': 'UsageMetric'}
    entity = entities.get(str(manifest.get('entity_type')))
    if not entity:
        raise ValueError('Archive entity type is not restorable')
    from zentinelle.models import AuditLog, Event
    from zentinelle.models.compliance import ContentScan, InteractionLog
    from zentinelle.models.usage import UsageMetric
    models = {item.__name__: item for item in (Event, AuditLog, InteractionLog, ContentScan, UsageMetric)}
    model = models[entity]
    manifest_subject = manifest.get('subject_id')
    allowed_fields = {field.name for field in model._meta.concrete_fields}
    try:
        with open(destination, 'rb') as archive:
            raw = archive.read()
    except OSError as exc:
        raise ValueError('Archive file is unavailable') from exc
    expected_checksum = manifest.get('archive_checksum')
    if expected_checksum and hashlib.sha256(raw).hexdigest() != expected_checksum:
        raise ValueError('Archive checksum verification failed')
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if len(records) != int(manifest.get('record_count', -1)):
        raise ValueError('Archive record count verification failed')
    if any(str(record.get('tenant_id')) != tenant_id for record in records):
        raise ValueError('Archive contains a cross-tenant record')
    if manifest_subject:
        subject_field = 'ext_user_id' if entity == 'AuditLog' else 'user_identifier'
        if any(str(record.get(subject_field, '')) != str(manifest_subject) for record in records):
            raise ValueError('Archive contains a record outside the manifest subject scope')
    if any(set(record) - allowed_fields for record in records):
        raise ValueError('Archive contains unsupported model fields')
    restored = 0
    if commit:
        with transaction.atomic():
            for record in records:
                record = dict(record)
                pk = record.pop('id', None)
                if pk is None or not model.objects.filter(pk=pk).exists():
                    if pk is not None:
                        record['id'] = pk
                    model.objects.create(**record)
                    restored += 1
            try:
                AuditLog.log(tenant_id=tenant_id, action='privacy.archive_restored', resource_type=entity,
                             resource_id=destination, ext_user_id=actor,
                             changes={'records': restored, 'manifest_digest': manifest.get('digest')})
            except Exception:
                pass
    return {'tenant_id': tenant_id, 'entity_type': entity, 'records': len(records),
            'restored': restored, 'dry_run': not commit, 'destination': destination}


def _held_for_subject(tenant_id, subject_id):
    from zentinelle.models.retention_policy import LegalHold
    now = timezone.now()
    return LegalHold.objects.filter(tenant_id=tenant_id, status='active', effective_date__lte=now).filter(
        Q(expiration_date__isnull=True) | Q(expiration_date__gt=now)
    ).filter(Q(applies_to_all=True) | Q(user_identifiers__contains=[subject_id])).exists()


def erase_tenant(tenant_id, *, actor='privacy-operator', subject_id=None):
    """Erase a tenant only when every configured store can acknowledge it.

    The operation fails closed if a legal hold is active or ClickHouse is
    configured but unavailable. No SQL rows are removed on a partial result.
    """
    tenant_id = str(tenant_id)
    with tenant_retention_lock(tenant_id):
        if subject_id:
            if _held_for_subject(tenant_id, subject_id):
                raise ValueError('Privacy erasure is blocked by an active legal hold for this subject')
        elif held(tenant_id):
            raise ValueError('Privacy erasure is blocked by an active legal hold')
        from zentinelle.services.clickhouse_service import erase_tenant_analytics, _get_clickhouse_url
        analytics_ok = False if subject_id else erase_tenant_analytics(tenant_id)
        if _get_clickhouse_url() and not analytics_ok:
            raise RuntimeError('ClickHouse privacy erasure could not be confirmed for this scope')
        from zentinelle.models import AuditLog, Event, RetentionOutcome
        from zentinelle.models.compliance import ContentScan, InteractionLog
        from zentinelle.models.usage import UsageMetric
        models = (Event, AuditLog, InteractionLog, ContentScan, UsageMetric)
        # Preflight every archive before deleting source rows. This prevents a
        # missing signature, unsupported destination, or unavailable remote
        # adapter from leaving a partially erased tenant.
        archive_plan = []
        outcomes = RetentionOutcome.objects.filter(tenant_id=tenant_id, status=RetentionOutcome.Status.ARCHIVED)
        if subject_id:
            outcomes = outcomes.filter(entity_type='user', manifest__subject_id=subject_id)
        for outcome in outcomes:
            manifest = outcome.manifest or {}
            if not verify_retention_manifest(manifest) or manifest.get('tenant_id') != tenant_id:
                raise RuntimeError('Cannot erase an archive with an invalid retention manifest')
            if subject_id and manifest.get('subject_id') != subject_id:
                continue
            destination = str(manifest.get('destination') or '')
            if destination.startswith('file://'):
                destination = destination[7:]
            if '://' in destination:
                from urllib.parse import urlparse
                parsed = urlparse(destination)
                adapter = _REMOTE_ERASURE_ADAPTERS.get(parsed.scheme.lower())
                if not adapter:
                    raise RuntimeError('Remote archive requires an authenticated provider erasure adapter')
                try:
                    confirmed = adapter(tenant_id=tenant_id, subject_id=subject_id, manifest=dict(manifest))
                except Exception as exc:
                    raise RuntimeError('Remote archive erasure adapter failed') from exc
                if confirmed is not True:
                    raise RuntimeError('Remote archive erasure was not confirmed by provider')
                archive_plan.append((outcome, manifest, destination, True))
            elif not os.path.isabs(destination):
                raise RuntimeError('Archive destination must be absolute or a supported remote URI')
            else:
                # Verify local archives before deleting any source rows. A
                # missing or replaced path is an incomplete retention state,
                # not proof that erasure succeeded.
                if os.path.islink(destination):
                    raise RuntimeError('Local archive cryptographic erasure requires a regular file')
                if not os.path.isfile(destination):
                    raise RuntimeError('Local archive is unavailable for erasure')
                expected_checksum = manifest.get('archive_checksum')
                if expected_checksum:
                    try:
                        with open(destination, 'rb') as archive:
                            actual_checksum = hashlib.sha256(archive.read()).hexdigest()
                    except OSError as exc:
                        raise RuntimeError('Local archive checksum could not be verified') from exc
                    if actual_checksum != expected_checksum:
                        raise RuntimeError('Local archive checksum verification failed')
                archive_plan.append((outcome, manifest, destination, None))
        counts = {}
        for model in models:
            query = model.objects.filter(tenant_id=tenant_id)
            if subject_id:
                field = 'ext_user_id' if model is AuditLog else 'user_identifier'
                query = query.filter(**{field: subject_id})
            deleted, _ = query.delete()
            counts[model.__name__] = deleted
        # Remove only verified local archive files belonging to this tenant.
        archived = 0
        for outcome, manifest, destination, adapter in archive_plan:
            if not adapter:
                try:
                    _secure_delete_file(destination)
                except RuntimeError:
                    raise
            archived += 1
            outcome.status = RetentionOutcome.Status.DELETED
            outcome.destination = ''
            outcome.save(update_fields=['status', 'destination'])
        try:
            AuditLog.log(tenant_id=tenant_id, action='privacy.erasure_completed',
                         resource_type='tenant', resource_id=tenant_id,
                         ext_user_id=actor,
                         changes={'stores': ['postgres', 'clickhouse' if analytics_ok else 'none'],
                                  'records': counts, 'archives': archived})
        except Exception:
            pass
        return {'tenant_id': tenant_id, 'subject_id': subject_id, 'records': counts, 'archives_deleted': archived,
                'clickhouse_confirmed': bool(analytics_ok), 'completed_at': timezone.now().isoformat()}
