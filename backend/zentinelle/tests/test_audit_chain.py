"""
Tests for the audit chain verification service (zentinelle.services.audit_chain).

All tests use unittest.mock — no database required.
"""
import hashlib
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from zentinelle.services.audit_chain import _compute_entry_hash, compute_chain_hash


def _make_record(
    tenant_id='tenant1',
    action='create',
    timestamp=None,
    ext_user_id='user1',
    resource_type='policy',
    resource_id='res-001',
    resource_name='',
    metadata=None,
    chain_sequence=1,
    entry_hash=None,
    chain_hash=None,
    prev_chain=None,
):
    """A stand-in AuditLog whose hashes are computed the way production does.

    Deliberately calls `_compute_entry_hash` rather than restating the content
    format. A test that re-implements the hash cannot notice the hash changing,
    and this file restating it is one of the three copies that had already
    drifted apart by the time #281 was found — the model hashed five fields,
    the verifier seven, and neither matched.
    """
    record = MagicMock()
    record.tenant_id = tenant_id
    record.action = action
    record.timestamp = timestamp or datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    record.ext_user_id = ext_user_id
    record.resource_type = resource_type
    record.resource_id = resource_id
    record.resource_name = resource_name
    record.metadata = {} if metadata is None else metadata
    record.chain_sequence = chain_sequence

    record.entry_hash = (
        _compute_entry_hash(record) if entry_hash is None else entry_hash
    )
    if chain_hash is None:
        seed = prev_chain if prev_chain is not None else ('genesis' if chain_sequence == 1 else '')
        record.chain_hash = compute_chain_hash(seed, record.entry_hash)
    else:
        record.chain_hash = chain_hash

    return record


def _chain_hash_for(prev_chain, entry_hash):
    return hashlib.sha256((prev_chain + entry_hash).encode()).hexdigest()


class TestVerifyChainEmpty(unittest.TestCase):
    """test_verify_chain_empty_returns_valid"""

    @patch('zentinelle.models.AuditLog')
    def test_verify_chain_empty_returns_valid(self, MockAuditLog):
        from zentinelle.services.audit_chain import verify_chain

        # Simulate an empty queryset
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.__iter__ = MagicMock(return_value=iter([]))
        MockAuditLog.objects.filter.return_value = mock_qs

        # list() needs to work on the qs
        with patch('zentinelle.models.AuditLog.objects') as mock_mgr:
            mock_mgr.filter.return_value.filter.return_value = []
            mock_mgr.filter.return_value.order_by.return_value.filter.return_value = []
            # Simplest approach: patch the whole filter chain to return []
            mock_mgr.filter.return_value.order_by.return_value = []

            result = verify_chain(tenant_id='tenant1')

        self.assertTrue(result['valid'])
        self.assertEqual(result['records_checked'], 0)
        self.assertIsNone(result['broken_at_sequence'])
        self.assertEqual(result['root_hash'], '')


class TestVerifySingleRecordValid(unittest.TestCase):
    """test_verify_single_record_valid"""

    @patch('zentinelle.models.AuditLog')
    def test_verify_single_record_valid(self, MockAuditLog):
        from zentinelle.services.audit_chain import verify_chain

        record = _make_record(chain_sequence=1)

        with patch('zentinelle.models.AuditLog.objects') as mock_mgr:
            mock_mgr.filter.return_value.order_by.return_value = [record]

            result = verify_chain(tenant_id='tenant1')

        self.assertTrue(result['valid'])
        self.assertEqual(result['records_checked'], 1)
        self.assertIsNone(result['broken_at_sequence'])
        self.assertEqual(result['root_hash'], record.chain_hash)


class TestVerifyChainTamperedRecord(unittest.TestCase):
    """test_verify_chain_tampered_record — record with wrong entry_hash -> broken_at_sequence"""

    @patch('zentinelle.models.AuditLog')
    def test_verify_chain_tampered_record(self, MockAuditLog):
        from zentinelle.services.audit_chain import verify_chain

        # Create a record but corrupt its entry_hash
        record = _make_record(chain_sequence=1, entry_hash='deadbeef' * 8)

        with patch('zentinelle.models.AuditLog.objects') as mock_mgr:
            mock_mgr.filter.return_value.order_by.return_value = [record]

            result = verify_chain(tenant_id='tenant1')

        self.assertFalse(result['valid'])
        self.assertEqual(result['broken_at_sequence'], 1)
        self.assertEqual(result['records_checked'], 1)


class TestComputeHashesDeterministic(unittest.TestCase):
    """test_compute_hashes_produces_deterministic_output — same inputs -> same hash"""

    def test_compute_hashes_produces_deterministic_output(self):
        """Calling compute_hashes twice on identical data produces identical hashes."""
        from zentinelle.services.audit_chain import _compute_entry_hash

        ts = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        record1 = _make_record(
            tenant_id='t1', action='create', timestamp=ts,
            ext_user_id='u1', resource_type='policy', resource_id='p-1',
        )
        record2 = _make_record(
            tenant_id='t1', action='create', timestamp=ts,
            ext_user_id='u1', resource_type='policy', resource_id='p-1',
        )

        hash1 = _compute_entry_hash(record1)
        hash2 = _compute_entry_hash(record2)
        self.assertEqual(hash1, hash2)
        self.assertEqual(len(hash1), 64)  # SHA-256 hex digest


class TestChainLinksToGenesisForFirstRecord(unittest.TestCase):
    """test_chain_links_to_genesis_for_first_record"""

    def test_chain_links_to_genesis_for_first_record(self):
        """First record (chain_sequence=1, no predecessor) uses 'genesis' as prev_chain."""
        from zentinelle.services.audit_chain import _compute_entry_hash

        ts = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        record = _make_record(chain_sequence=1, timestamp=ts)

        expected_entry = _compute_entry_hash(record)
        expected_chain = hashlib.sha256(('genesis' + expected_entry).encode()).hexdigest()

        self.assertEqual(record.entry_hash, expected_entry)
        self.assertEqual(record.chain_hash, expected_chain)


class TestVerifyMultiRecordChain(unittest.TestCase):
    """Integration-style test: two properly-linked records verify as valid."""

    @patch('zentinelle.models.AuditLog')
    def test_two_linked_records_valid(self, MockAuditLog):
        from zentinelle.services.audit_chain import verify_chain, _compute_entry_hash

        ts1 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ts2 = datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc)

        r1 = _make_record(chain_sequence=1, timestamp=ts1)
        # Build r2 with correct chain link
        r2_entry = _compute_entry_hash(
            _make_record(chain_sequence=2, timestamp=ts2)
        )
        r2_chain = _chain_hash_for(r1.chain_hash, r2_entry)
        r2 = _make_record(
            chain_sequence=2, timestamp=ts2,
            entry_hash=r2_entry, chain_hash=r2_chain,
        )

        with patch('zentinelle.models.AuditLog.objects') as mock_mgr:
            mock_mgr.filter.return_value.order_by.return_value = [r1, r2]

            result = verify_chain(tenant_id='tenant1')

        self.assertTrue(result['valid'])
        self.assertEqual(result['records_checked'], 2)
        self.assertEqual(result['root_hash'], r2.chain_hash)

    @patch('zentinelle.models.AuditLog')
    def test_broken_chain_hash_detected(self, MockAuditLog):
        """Second record with wrong chain_hash is detected."""
        from zentinelle.services.audit_chain import verify_chain, _compute_entry_hash

        ts1 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        ts2 = datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc)

        r1 = _make_record(chain_sequence=1, timestamp=ts1)
        r2_entry = _compute_entry_hash(_make_record(chain_sequence=2, timestamp=ts2))
        # Deliberately wrong chain hash
        r2 = _make_record(
            chain_sequence=2, timestamp=ts2,
            entry_hash=r2_entry,
            chain_hash='00' * 32,  # 64-char wrong hash
        )

        with patch('zentinelle.models.AuditLog.objects') as mock_mgr:
            mock_mgr.filter.return_value.order_by.return_value = [r1, r2]

            result = verify_chain(tenant_id='tenant1')

        self.assertFalse(result['valid'])
        self.assertEqual(result['broken_at_sequence'], 2)


if __name__ == '__main__':
    unittest.main()
