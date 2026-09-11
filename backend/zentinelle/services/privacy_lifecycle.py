"""Explicit tenant privacy erasure with hold-aware cross-store accounting."""
import os
from django.db.models import Q
from django.utils import timezone

from zentinelle.services.retention import held, tenant_retention_lock, verify_retention_manifest


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
        outcomes = RetentionOutcome.objects.filter(tenant_id=tenant_id, status=RetentionOutcome.Status.ARCHIVED)
        if subject_id:
            outcomes = outcomes.filter(entity_type='user', manifest__subject_id=subject_id)
        for outcome in outcomes:
            manifest = outcome.manifest or {}
            if not verify_retention_manifest(manifest) or manifest.get('tenant_id') != tenant_id:
                raise RuntimeError('Cannot erase an archive with an invalid retention manifest')
            destination = str(manifest.get('destination') or '')
            if destination.startswith('file://'):
                destination = destination[7:]
            if '://' in destination or not os.path.isabs(destination):
                raise RuntimeError('Remote archive requires an authenticated provider erasure adapter')
            try:
                os.unlink(destination)
                archived += 1
            except FileNotFoundError:
                pass
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
