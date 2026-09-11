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
        value = obj.get(attr, default) if isinstance(obj, dict) else getattr(obj, attr, default)
        return default if value is None else value

    timestamp = _get(record, 'timestamp')
    if hasattr(timestamp, 'isoformat'):
        timestamp_str = timestamp.isoformat()
    else:
        timestamp_str = str(timestamp) if timestamp else ''

    if int(_get(record, 'hash_version', 1)) == 2:
        fields = ('id', 'tenant_id', 'action', 'ext_user_id', 'api_key_prefix',
                  'ip_address', 'user_agent', 'resource_type', 'resource_id', 'resource_name')
        content = {field: str(_get(record, field)) for field in fields}
        content.update(timestamp=timestamp_str, hash_version=2,
                       chain_sequence=int(_get(record, 'chain_sequence', 0)),
                       changes=_get(record, 'changes', {}) or {}, metadata=_get(record, 'metadata', {}) or {})
        return hashlib.sha256(json.dumps(content, sort_keys=True, separators=(',', ':'),
                                         ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    if int(_get(record, 'hash_version', 1)) != 1:
        raise ValueError('Unsupported audit hash version')

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


def serialize_record(record):
    """Lossless, independently verifiable NDJSON representation."""
    fields = ('id', 'tenant_id', 'ext_user_id', 'api_key_prefix', 'ip_address', 'user_agent',
              'action', 'resource_type', 'resource_id', 'resource_name', 'changes', 'metadata',
              'timestamp', 'entry_hash', 'chain_hash', 'chain_sequence', 'hash_version')
    result = {field: getattr(record, field) for field in fields}
    result['id'] = str(result['id'])
    result['timestamp'] = result['timestamp'].isoformat()
    return result


def _checkpoint_key():
    from django.conf import settings
    return getattr(settings, 'AUDIT_CHECKPOINT_SIGNING_KEY', settings.SECRET_KEY)


def checkpoint(tenant_id):
    """An operator can retain this signed head outside the application database."""
    from django.core import signing

    from zentinelle.models.audit import AuditChainHead
    head = AuditChainHead.objects.filter(tenant_id=tenant_id).first()
    payload = {'tenant_id': tenant_id, 'sequence': head.last_sequence if head else 0,
               'chain_hash': head.last_chain_hash if head else '',
               'archived_sequence': head.archived_sequence if head else 0,
               'archived_chain_hash': head.archived_chain_hash if head else ''}
    return signing.dumps(payload, key=_checkpoint_key(), salt='audit-checkpoint-v1')


def verify_chain(tenant_id: str, from_sequence: int = 1,
                 to_sequence: Optional[int] = None, expected_checkpoint=None) -> dict:
    from django.db import router, transaction

    from zentinelle.models.audit import AuditChainHead
    with transaction.atomic(using=router.db_for_write(AuditChainHead)):
        AuditChainHead.objects.select_for_update().filter(tenant_id=tenant_id).first()
        return _verify_chain(tenant_id, from_sequence, to_sequence, expected_checkpoint)


def _verify_chain(tenant_id: str, from_sequence: int = 1,
                  to_sequence: Optional[int] = None, expected_checkpoint=None) -> dict:
    from django.core import signing

    from zentinelle.models import AuditLog
    from zentinelle.models.audit import AuditChainHead
    head = AuditChainHead.objects.filter(tenant_id=tenant_id).first()
    archived = head.archived_sequence if head else 0
    start = max(from_sequence, archived + 1, 1)
    end = to_sequence if to_sequence is not None else (head.last_sequence if head else 0)
    result = {'valid': True, 'records_checked': 0,
              'unverifiable_records': AuditLog.objects.filter(tenant_id=tenant_id, entry_hash='', chain_hash='').count(),
              'broken_at_sequence': None, 'root_hash': '', 'archived_through_sequence': archived}

    def broken(sequence):
        result.update(valid=False, broken_at_sequence=sequence)
        return result

    if archived and head.archived_checkpoint:
        try:
            boundary = signing.loads(head.archived_checkpoint, key=_checkpoint_key(), salt='audit-retention-v1')
            if boundary != {'tenant_id': tenant_id, 'sequence': archived, 'chain_hash': head.archived_chain_hash}:
                return broken(archived)
        except signing.BadSignature:
            return broken(archived)
    elif archived:
        return broken(archived)

    if start == archived + 1:
        prev = head.archived_chain_hash if archived else GENESIS
    else:
        predecessor = AuditLog.objects.filter(tenant_id=tenant_id, chain_sequence=start - 1).first()
        if predecessor is None:
            return broken(start - 1)
        prev = predecessor.chain_hash
    next_sequence = start
    records = AuditLog.objects.filter(tenant_id=tenant_id, chain_sequence__gte=start)
    if to_sequence is not None:
        records = records.filter(chain_sequence__lte=to_sequence)
    for record in records.order_by('chain_sequence').iterator(chunk_size=500):
        result['records_checked'] += 1
        if record.chain_sequence != next_sequence:
            return broken(next_sequence)
        try:
            if _compute_entry_hash(record) != record.entry_hash or compute_chain_hash(prev, record.entry_hash) != record.chain_hash:
                return broken(record.chain_sequence)
        except (ValueError, TypeError):
            return broken(record.chain_sequence)
        prev = record.chain_hash
        result['root_hash'] = prev
        next_sequence += 1
    if next_sequence != end + 1 and end >= start:
        return broken(next_sequence)
    if not head and result['records_checked']:
        return broken(0)
    if to_sequence is None and head:
        if next_sequence - 1 != head.last_sequence or (prev if prev != GENESIS else '') != head.last_chain_hash:
            return broken(next_sequence)
    if expected_checkpoint:
        try:
            pinned = signing.loads(expected_checkpoint, key=_checkpoint_key(), salt='audit-checkpoint-v1')
            if pinned['tenant_id'] != tenant_id or not head or pinned['sequence'] > head.last_sequence:
                return broken(pinned.get('sequence', 0))
            if pinned['sequence'] > archived:
                record = AuditLog.objects.filter(tenant_id=tenant_id, chain_sequence=pinned['sequence']).first()
                if not record or record.chain_hash != pinned['chain_hash']:
                    return broken(pinned['sequence'])
            elif pinned['sequence'] < archived:
                from zentinelle.models.audit import AuditRetentionProof
                proof = AuditRetentionProof.objects.filter(tenant_id=tenant_id, first_sequence__lte=pinned['sequence'],
                                                           last_sequence__gte=pinned['sequence']).first()
                if not proof:
                    return broken(pinned['sequence'])
                witness = signing.loads(proof.proof, key=_checkpoint_key(), salt='audit-retention-proof-v1')
                index = pinned['sequence'] - witness['first_sequence']
                if witness['tenant_id'] != tenant_id or witness['chain_hashes'][index] != pinned['chain_hash']:
                    return broken(pinned['sequence'])
            elif pinned['sequence'] == archived and pinned['chain_hash'] != head.archived_chain_hash:
                return broken(archived)
        except (signing.BadSignature, KeyError, TypeError, IndexError):
            return broken(0)
    return result


def prune_audit_prefix(tenant_id, cutoff):
    """Delete only an expired contiguous prefix, retaining its signed boundary."""
    from django.core import signing
    from django.db import router, transaction

    from zentinelle.models import AuditLog
    from zentinelle.models.audit import AuditChainHead, AuditRetentionProof
    from zentinelle.services.retention import held
    with transaction.atomic(using=router.db_for_write(AuditChainHead)):
        if held(tenant_id):
            return 0
        head = AuditChainHead.objects.select_for_update().filter(tenant_id=tenant_id).first()
        if not head:
            return 0
        if not verify_chain(tenant_id)['valid']:
            raise ValueError('Refusing retention on a broken audit chain')
        boundary = None
        chain_hashes = []
        first_sequence = head.archived_sequence + 1
        for record in AuditLog.objects.filter(tenant_id=tenant_id, chain_sequence__gt=head.archived_sequence).order_by('chain_sequence').iterator():
            if record.timestamp >= cutoff:
                break
            boundary = record
            chain_hashes.append(record.chain_hash)
        if boundary is None:
            return 0
        for offset in range(0, len(chain_hashes), 1000):
            hashes = chain_hashes[offset:offset + 1000]
            start = first_sequence + offset
            proof = {'tenant_id': tenant_id, 'first_sequence': start, 'chain_hashes': hashes}
            AuditRetentionProof.objects.create(tenant_id=tenant_id, first_sequence=start,
                                               last_sequence=start + len(hashes) - 1,
                                               proof=signing.dumps(proof, key=_checkpoint_key(), salt='audit-retention-proof-v1', compress=True))
        head.archived_sequence = boundary.chain_sequence
        head.archived_chain_hash = boundary.chain_hash
        head.archived_checkpoint = signing.dumps(
            {'tenant_id': tenant_id, 'sequence': boundary.chain_sequence, 'chain_hash': boundary.chain_hash},
            key=_checkpoint_key(), salt='audit-retention-v1',
        )
        head.save(update_fields=['archived_sequence', 'archived_chain_hash', 'archived_checkpoint', 'updated_at'])
        deleted, _ = AuditLog.objects.filter(tenant_id=tenant_id, chain_sequence__gt=0,
                                             chain_sequence__lte=boundary.chain_sequence).delete()
        return deleted


def verify_recent(tenant_id: str, limit: int = 100) -> dict:
    from zentinelle.models.audit import AuditChainHead
    head = AuditChainHead.objects.filter(tenant_id=tenant_id).first()
    start = max(1, (head.last_sequence if head else 0) - max(1, min(limit, 10000)) + 1)
    return verify_chain(tenant_id, from_sequence=start)


def stream_evidence_bundle(queryset, tenant_id, selection):
    """Stream lossless records followed by a signed completeness manifest.

    Consumers must require the last line: interrupted downloads have no valid
    manifest. The signature needs an independently retained operator key.
    """
    from django.core import signing
    digest = hashlib.sha256()
    count = 0
    for record in queryset.iterator(chunk_size=500):
        payload = serialize_record(record)
        if record.entry_hash and _compute_entry_hash(payload) != record.entry_hash:
            raise ValueError('Refusing to export an invalid audit record')
        line = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False) + '\n'
        digest.update(line.encode())
        count += 1
        yield line
    manifest = {'tenant_id': tenant_id, 'count': count, 'sha256': digest.hexdigest(),
                'selection': selection, 'checkpoint': checkpoint(tenant_id)}
    yield json.dumps({'_manifest': signing.dumps(manifest, key=_checkpoint_key(), salt='audit-export-v1')}) + '\n'


def verify_evidence_bundle(lines, tenant_id):
    """Verify a downloaded bundle without reading the database."""
    from django.core import signing
    digest = hashlib.sha256()
    count = 0
    manifest = None
    try:
        for line in lines:
            line = line.decode() if isinstance(line, bytes) else line
            record = json.loads(line)
            if manifest is not None:
                return {'valid': False, 'reason': 'Data follows manifest'}
            if '_manifest' in record:
                manifest = signing.loads(record['_manifest'], key=_checkpoint_key(), salt='audit-export-v1')
                continue
            if record['tenant_id'] != tenant_id:
                return {'valid': False, 'reason': 'Tenant mismatch'}
            if record['entry_hash'] and _compute_entry_hash(record) != record['entry_hash']:
                return {'valid': False, 'reason': 'Record hash mismatch'}
            digest.update(line.encode())
            count += 1
        valid = bool(manifest and manifest['tenant_id'] == tenant_id and
                     manifest['count'] == count and manifest['sha256'] == digest.hexdigest())
        return {'valid': valid, 'records_checked': count, 'manifest': manifest}
    except (ValueError, TypeError, KeyError, signing.BadSignature):
        return {'valid': False, 'reason': 'Invalid bundle'}
