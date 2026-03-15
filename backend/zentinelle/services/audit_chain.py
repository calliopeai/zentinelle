"""
Audit chain verification service.

Verifies that a sequence of AuditLog records has not been tampered with
by recomputing hashes and validating the chain.
"""
import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _compute_entry_hash(record) -> str:
    """Recompute the entry hash for an AuditLog record (or dict-like object)."""
    def _get(obj, attr):
        if isinstance(obj, dict):
            return obj.get(attr, '')
        return getattr(obj, attr, '') or ''

    tenant_id = _get(record, 'tenant_id')
    action = _get(record, 'action')
    timestamp = _get(record, 'timestamp')
    ext_user_id = _get(record, 'ext_user_id')
    resource_type = _get(record, 'resource_type')
    resource_id = _get(record, 'resource_id')

    if hasattr(timestamp, 'isoformat'):
        timestamp_str = timestamp.isoformat()
    else:
        timestamp_str = str(timestamp) if timestamp else ''

    content = '|'.join([
        str(tenant_id),
        str(action),
        timestamp_str,
        str(ext_user_id),
        str(action),
        str(resource_type),
        str(resource_id),
    ])
    return hashlib.sha256(content.encode()).hexdigest()


def verify_chain(
    tenant_id: str,
    from_sequence: int = 1,
    to_sequence: Optional[int] = None,
) -> dict:
    """
    Verify the audit chain for a tenant between from_sequence and to_sequence.

    Fetches records in order, recomputes entry_hash for each, and verifies
    chain_hash linkage across all records.

    Records that pre-date the migration (entry_hash == '') are skipped
    gracefully — the chain is considered unbroken across such gaps.

    Returns:
        {
            'valid': bool,
            'records_checked': int,
            'broken_at_sequence': int | None,
            'root_hash': str,           # chain_hash of the last record checked
        }
    """
    from zentinelle.models import AuditLog

    qs = AuditLog.objects.filter(
        tenant_id=tenant_id,
        chain_sequence__gte=from_sequence,
    ).order_by('chain_sequence')

    if to_sequence is not None:
        qs = qs.filter(chain_sequence__lte=to_sequence)

    records = list(qs)

    if not records:
        return {
            'valid': True,
            'records_checked': 0,
            'broken_at_sequence': None,
            'root_hash': '',
        }

    records_checked = 0
    prev_chain = 'genesis'
    root_hash = ''

    for record in records:
        # Skip pre-migration records that have no hash yet
        if not record.entry_hash and not record.chain_hash:
            # Advance prev_chain only if we have a stored chain_hash to continue from
            continue

        records_checked += 1

        # Recompute entry hash
        expected_entry_hash = _compute_entry_hash(record)
        if expected_entry_hash != record.entry_hash:
            logger.warning(
                "Audit chain broken: entry_hash mismatch at sequence %d for tenant %s",
                record.chain_sequence,
                tenant_id,
            )
            return {
                'valid': False,
                'records_checked': records_checked,
                'broken_at_sequence': record.chain_sequence,
                'root_hash': root_hash,
            }

        # Verify chain linkage
        expected_chain_hash = hashlib.sha256(
            (prev_chain + record.entry_hash).encode()
        ).hexdigest()
        if expected_chain_hash != record.chain_hash:
            logger.warning(
                "Audit chain broken: chain_hash mismatch at sequence %d for tenant %s",
                record.chain_sequence,
                tenant_id,
            )
            return {
                'valid': False,
                'records_checked': records_checked,
                'broken_at_sequence': record.chain_sequence,
                'root_hash': root_hash,
            }

        prev_chain = record.chain_hash
        root_hash = record.chain_hash

    return {
        'valid': True,
        'records_checked': records_checked,
        'broken_at_sequence': None,
        'root_hash': root_hash,
    }


def verify_recent(tenant_id: str, limit: int = 100) -> dict:
    """
    Verify the most recent N audit records for a tenant.

    Convenience wrapper around verify_chain that operates on the
    tail of the chain rather than requiring explicit sequence numbers.

    Returns the same dict as verify_chain.
    """
    from zentinelle.models import AuditLog

    # Find the highest sequence number for this tenant
    last = (
        AuditLog.objects.filter(tenant_id=tenant_id)
        .order_by('-chain_sequence')
        .values_list('chain_sequence', flat=True)
        .first()
    )
    if last is None:
        return {
            'valid': True,
            'records_checked': 0,
            'broken_at_sequence': None,
            'root_hash': '',
        }

    from_sequence = max(1, last - limit + 1)
    return verify_chain(tenant_id=tenant_id, from_sequence=from_sequence, to_sequence=last)
