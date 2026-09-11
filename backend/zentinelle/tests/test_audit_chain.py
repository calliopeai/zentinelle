"""Verify persisted history, including tampering, legacy hashes and retained prefixes."""
import json
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from zentinelle.models import AuditLog
from zentinelle.models.audit import AuditChainHead
from zentinelle.services.audit_chain import (_compute_entry_hash, checkpoint,
                                             compute_chain_hash,
                                             prune_audit_prefix,
                                             serialize_record, verify_chain)


class AuditChainVerificationTests(TestCase):
    tenant = 'audit-test'

    def entry(self, **kwargs):
        defaults = {'tenant_id': self.tenant, 'action': 'update', 'resource_type': 'policy',
                    'resource_id': 'p1', 'changes': {'enabled': False}, 'metadata': {'source': 'console'}}
        defaults.update(kwargs)
        return AuditLog.objects.create(**defaults)

    def test_empty_chain_is_valid(self):
        result = verify_chain(self.tenant)
        self.assertTrue(result['valid'])
        self.assertEqual(result['records_checked'], 0)

    def test_two_persisted_records_link_and_verify(self):
        first, second = self.entry(), self.entry(resource_id='p2')
        self.assertEqual(second.chain_hash, compute_chain_hash(first.chain_hash, second.entry_hash))
        self.assertTrue(verify_chain(self.tenant)['valid'])
        self.assertEqual(verify_chain(self.tenant)['records_checked'], 2)
        self.assertTrue(verify_chain(self.tenant, from_sequence=2)['valid'])

    def test_every_security_field_is_covered(self):
        record = self.entry()
        for field, value in [('changes', {'enabled': True}), ('ip_address', '192.0.2.4'),
                             ('api_key_prefix', 'changed'), ('user_agent', 'changed'),
                             ('ext_user_id', 'changed'), ('resource_name', 'changed'),
                             ('metadata', {'source': 'changed'})]:
            original = getattr(record, field)
            with self.subTest(field=field):
                AuditLog.objects.filter(pk=record.pk).update(**{field: value})
                self.assertFalse(verify_chain(self.tenant)['valid'])
                AuditLog.objects.filter(pk=record.pk).update(**{field: original})
        self.assertTrue(verify_chain(self.tenant)['valid'])

    def test_missing_middle_and_deleted_tail_are_detected(self):
        first, second, third = self.entry(), self.entry(), self.entry()
        AuditLog.objects.filter(pk=second.pk).delete()
        self.assertFalse(verify_chain(self.tenant)['valid'])
        AuditLog.objects.filter(pk=third.pk).delete()
        self.assertFalse(verify_chain(self.tenant)['valid'])
        AuditLog.objects.filter(pk=first.pk).delete()
        self.assertFalse(verify_chain(self.tenant)['valid'])

    def test_lossless_export_rehashes(self):
        record = self.entry()
        exported = json.loads(json.dumps(serialize_record(record)))
        self.assertEqual(_compute_entry_hash(exported), record.entry_hash)
        exported['changes']['enabled'] = True
        self.assertNotEqual(_compute_entry_hash(exported), record.entry_hash)

    def test_legacy_version_remains_verifiable_without_claiming_new_coverage(self):
        record = self.entry(hash_version=1)
        self.assertEqual(record.hash_version, 1)
        self.assertTrue(verify_chain(self.tenant)['valid'])
        self.entry()
        self.assertTrue(verify_chain(self.tenant)['valid'])

    def test_retention_preserves_a_signed_proof_for_older_pinned_heads(self):
        old = timezone.now() - timedelta(days=500)
        first = self.entry(timestamp=old)
        pinned = checkpoint(self.tenant)
        self.entry(timestamp=old)
        self.entry()
        self.assertEqual(prune_audit_prefix(self.tenant, timezone.now() - timedelta(days=365)), 2)
        self.assertFalse(AuditLog.objects.filter(pk=first.pk).exists())
        result = verify_chain(self.tenant, expected_checkpoint=pinned)
        self.assertTrue(result['valid'])
        self.assertEqual(result['archived_through_sequence'], 2)

    def test_external_pin_detects_rewritten_tail_and_head(self):
        record = self.entry()
        pinned = checkpoint(self.tenant)
        AuditLog.objects.filter(pk=record.pk).delete()
        AuditChainHead.objects.filter(tenant_id=self.tenant).update(last_sequence=0, last_chain_hash='')
        self.assertFalse(verify_chain(self.tenant, expected_checkpoint=pinned)['valid'])

    def test_model_rejects_in_place_edits(self):
        from django.core.exceptions import ValidationError
        record = self.entry()
        record.action = 'delete'
        with self.assertRaises(ValidationError):
            record.save()
