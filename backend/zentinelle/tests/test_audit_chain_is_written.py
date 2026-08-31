"""The audit chain is actually written, and detects tampering (#281).

`AuditLog` advertised a tamper-evident chain — `entry_hash`, `chain_hash`,
`chain_sequence`, a verifier, a REST endpoint — and none of it had ever been
populated in any deployment. The cause was one guard: `save()` computed the
hash `if not self.pk`, and `id` is a UUIDField with `default=uuid.uuid4`, so
`pk` is set the moment the instance is constructed and the branch was dead.

Everything here fails on a chain that is not written, which is the point: the
old code passed the existing tests because they only ever exercised the
verifier against records they had hashed by hand.
"""
from django.test import TestCase, TransactionTestCase

from zentinelle.models import AuditLog
from zentinelle.services.audit_chain import verify_chain

TENANT = '00000000-0000-0000-0000-0000000000c1'


def _log(n, tenant_id=TENANT):
    return AuditLog.objects.create(
        tenant_id=tenant_id,
        action=AuditLog.Action.CREATE,
        resource_type='policy',
        resource_id=f'res-{n}',
        resource_name=f'Policy {n}',
        ext_user_id='someone',
        metadata={'n': n},
    )


class AuditChainIsWrittenTest(TestCase):
    def test_a_created_record_carries_its_hashes(self):
        record = _log(1)
        self.assertTrue(record.entry_hash, 'entry_hash was not written')
        self.assertTrue(record.chain_hash, 'chain_hash was not written')
        self.assertEqual(record.chain_sequence, 1)

    def test_records_are_linked_and_verify(self):
        for n in range(1, 6):
            _log(n)

        result = verify_chain(TENANT)
        self.assertTrue(result['valid'], result)
        self.assertEqual(result['records_checked'], 5)
        self.assertEqual(result['unverifiable_records'], 0)
        self.assertIsNone(result['broken_at_sequence'])
        self.assertEqual(
            result['root_hash'],
            AuditLog.objects.filter(tenant_id=TENANT).order_by('-chain_sequence').first().chain_hash,
        )

    def test_sequences_are_per_tenant(self):
        _log(1)
        other = _log(1, tenant_id='00000000-0000-0000-0000-0000000000c2')
        self.assertEqual(
            other.chain_sequence, 1,
            'a second tenant started from the first tenant\'s sequence',
        )

    def test_editing_a_record_is_detected(self):
        for n in range(1, 4):
            _log(n)
        victim = AuditLog.objects.filter(tenant_id=TENANT, chain_sequence=2).first()

        # An edit straight to the database, which is the threat: someone with
        # table access changing what the record says happened.
        AuditLog.objects.filter(pk=victim.pk).update(resource_id='res-tampered')

        result = verify_chain(TENANT)
        self.assertFalse(result['valid'], 'a rewritten record verified as intact')
        self.assertEqual(result['broken_at_sequence'], 2)

    def test_editing_the_metadata_is_detected(self):
        """Metadata is part of the hash, so rewriting it is tampering too.

        It was not covered before: the old content string omitted it, so a
        record whose metadata had been rewritten verified as untouched.
        """
        _log(1)
        victim = AuditLog.objects.filter(tenant_id=TENANT, chain_sequence=1).first()
        AuditLog.objects.filter(pk=victim.pk).update(metadata={'n': 'rewritten'})

        result = verify_chain(TENANT)
        self.assertFalse(result['valid'], 'rewritten metadata verified as intact')

    def test_deleting_a_record_breaks_the_link(self):
        for n in range(1, 4):
            _log(n)
        AuditLog.objects.filter(tenant_id=TENANT, chain_sequence=2).delete()

        result = verify_chain(TENANT)
        self.assertFalse(
            result['valid'],
            'a removed record left the chain reading as intact, which is the '
            'one thing a chain exists to prevent',
        )

    def test_unhashed_history_is_reported_not_counted_as_verified(self):
        """Rows written before any of this existed are admitted, not claimed.

        Back-filling them would make unverified history indistinguishable from
        verified history, so they are counted separately and never as checked.
        """
        AuditLog.objects.create(
            tenant_id=TENANT, action=AuditLog.Action.CREATE,
            resource_type='policy', resource_id='old', chain_sequence=0,
        )
        AuditLog.objects.filter(tenant_id=TENANT, resource_id='old').update(
            entry_hash='', chain_hash='',
        )
        _log(2)

        result = verify_chain(TENANT)
        self.assertEqual(result['unverifiable_records'], 1)
        self.assertEqual(result['records_checked'], 1)


class AuditChainConcurrencyTest(TransactionTestCase):
    """Two writers cannot end up at the same point in one tenant's chain."""

    def test_concurrent_writes_do_not_fork_the_chain(self):
        import threading

        errors = []

        def write(n):
            try:
                _log(n)
            except Exception as exc:  # noqa: BLE001 - reported below
                errors.append(exc)

        threads = [threading.Thread(target=write, args=(n,)) for n in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(errors, [], f'a writer failed outright: {errors}')

        sequences = list(
            AuditLog.objects.filter(tenant_id=TENANT)
            .order_by('chain_sequence')
            .values_list('chain_sequence', flat=True)
        )
        self.assertEqual(
            sequences, sorted(set(sequences)),
            'two records share a sequence: the chain forked',
        )
        self.assertTrue(verify_chain(TENANT)['valid'], 'the chain does not verify')
