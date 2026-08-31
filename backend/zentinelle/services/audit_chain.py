"""
Audit chain verification service.

Verifies that a sequence of AuditLog records has not been tampered with
by recomputing hashes and validating the chain.
"""
import hashlib
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


#: What a record's hash covers. Everything an auditor would object to seeing
#: changed: who did what, to which resource, when, and the detail attached.
#:
#: `metadata` is serialised with sorted keys so the same mapping always hashes
#: the same way; without that, a dict that round-tripped through JSON could
#: rehash differently and read as tampering.
#:
#: Changing this set invalidates every hash already written. That is free
#: exactly once, and this is that once: no row has ever carried a hash (#281),
#: so the definition can be made right before anything depends on it. It was
#: worth doing, because the previous version hashed `action` twice and omitted
#: `resource_name` and `metadata` — a record whose metadata was rewritten
#: verified as untouched.
GENESIS = 'genesis'


def _compute_entry_hash(record) -> str:
    """The hash of one record's content. The single definition, used by both
    the model that writes it and the verifier that checks it.

    Two copies of this existed and disagreed: `AuditLog.save()` hashed five
    fields and no timestamp, `verify_chain` hashed seven including one twice.
    Had the write path ever run, every record it produced would have failed
    verification immediately.
    """
    def _get(obj, attr, default=''):
        if isinstance(obj, dict):
            return obj.get(attr, default)
        value = getattr(obj, attr, default)
        return default if value is None else value

    timestamp = _get(record, 'timestamp')
    if hasattr(timestamp, 'isoformat'):
        timestamp_str = timestamp.isoformat()
    else:
        timestamp_str = str(timestamp) if timestamp else ''

    metadata = _get(record, 'metadata', {}) or {}
    try:
        metadata_str = json.dumps(metadata, sort_keys=True, separators=(',', ':'), default=str)
    except (TypeError, ValueError):
        metadata_str = str(metadata)

    content = '|'.join([
        str(_get(record, 'tenant_id')),
        str(_get(record, 'action')),
        timestamp_str,
        str(_get(record, 'ext_user_id')),
        str(_get(record, 'resource_type')),
        str(_get(record, 'resource_id')),
        str(_get(record, 'resource_name')),
        metadata_str,
    ])
    return hashlib.sha256(content.encode()).hexdigest()


def compute_chain_hash(prev_chain_hash: str, entry_hash: str) -> str:
    """Link one record to the one before it."""
    return hashlib.sha256(((prev_chain_hash or GENESIS) + entry_hash).encode()).hexdigest()


def verify_chain(
    tenant_id: str,
    from_sequence: int = 1,
    to_sequence: Optional[int] = None,
) -> dict:
    """
    Verify the audit chain for a tenant between from_sequence and to_sequence.

    Fetches records in order, recomputes entry_hash for each, and verifies
    chain_hash linkage across all records.

    Records that pre-date the chain being written at all (entry_hash == '')
    cannot be checked. They are reported in `unverifiable_records` and are
    never counted in `records_checked`: a count that included them would say
    more rows had been verified than had been, and `valid` would be a claim
    about rows nothing could vouch for.

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
            'unverifiable_records': 0,
            'broken_at_sequence': None,
            'root_hash': '',
        }

    records_checked = 0
    unverifiable = 0
    root_hash = ''

    # Seed prev_chain: 'genesis' if starting from sequence 1, otherwise
    # use the previous record's chain_hash so tail-only verification works.
    if from_sequence > 1:
        prev_record = AuditLog.objects.filter(
            tenant_id=tenant_id,
            chain_sequence=from_sequence - 1,
        ).first()
        if prev_record and prev_record.chain_hash:
            prev_chain = prev_record.chain_hash
        else:
            # No predecessor available — can't verify tail-only, fall back to genesis
            prev_chain = 'genesis'
    else:
        prev_chain = 'genesis'

    for record in records:
        # Records written before the chain was ever computed (#281) carry no
        # hashes. They are counted separately and never counted as verified:
        # they cannot be checked, and reporting them as valid would state an
        # integrity guarantee that did not exist when they were written.
        #
        # They are not back-filled either. Hashing them now would make
        # unverified history indistinguishable from verified history, which is
        # the one outcome worse than admitting the gap.
        if not record.entry_hash and not record.chain_hash:
            unverifiable += 1
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
                'unverifiable_records': unverifiable,
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
                'unverifiable_records': unverifiable,
                'broken_at_sequence': record.chain_sequence,
                'root_hash': root_hash,
            }

        prev_chain = record.chain_hash
        root_hash = record.chain_hash

    return {
        'valid': True,
        'records_checked': records_checked,
        'unverifiable_records': unverifiable,
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
