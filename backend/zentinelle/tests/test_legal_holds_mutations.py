"""
Tests for LegalHold GraphQL mutations wired in this session.

Covers: createLegalHold, updateLegalHold, releaseLegalHold, deleteLegalHold.

Note: Several bugs in the originally wired ``retention.py`` were caught
and fixed by these tests:
1. Mutations referenced removed FKs (organization, custodian, created_by);
   they now use the standalone ``tenant_id`` / ``user_id`` columns.
2. ``LegalHold.release()`` referenced a removed ``released_by`` FK; it
   now records release metadata in the ``metadata`` JSON blob.
"""
from datetime import datetime, timezone

from django.test import TestCase

from zentinelle.models import LegalHold
from zentinelle.schema import schema
from zentinelle.tests._graphql_helpers import (
    STANDALONE_TENANT,
    admin_context,
    anon_context,
)


CREATE_HOLD = """
mutation Create($input: CreateLegalHoldInput!) {
  createLegalHold(input: $input) {
    success errors holdId
  }
}
"""

UPDATE_HOLD = """
mutation Update($input: UpdateLegalHoldInput!) {
  updateLegalHold(input: $input) {
    success errors holdId
  }
}
"""

RELEASE_HOLD = """
mutation Release($id: ID!) {
  releaseLegalHold(id: $id) {
    success holdId
  }
}
"""

DELETE_HOLD = """
mutation Delete($id: ID!) {
  deleteLegalHold(id: $id) {
    success errors
  }
}
"""


def _exec(query, variables=None, context=None):
    return schema.execute_sync(
        query,
        variable_values=variables or {},
        context_value=context or admin_context(),
    )


class CreateLegalHoldTests(TestCase):

    def test_create_minimal_happy_path(self):
        result = _exec(CREATE_HOLD, {
            'input': {'name': 'Q4 Litigation Hold'},
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['createLegalHold']
        self.assertTrue(payload['success'], msg=payload.get('errors'))
        self.assertIsNotNone(payload['holdId'])

        hold = LegalHold.objects.get(pk=payload['holdId'])
        self.assertEqual(hold.name, 'Q4 Litigation Hold')
        self.assertEqual(hold.tenant_id, STANDALONE_TENANT)
        self.assertEqual(hold.status, LegalHold.HoldStatus.ACTIVE)
        # Default hold type is "preservation"
        self.assertEqual(hold.hold_type, LegalHold.HoldType.PRESERVATION)
        # Audit columns populated
        self.assertEqual(hold.user_id, '1')

    def test_create_full_fields(self):
        result = _exec(CREATE_HOLD, {
            'input': {
                'name': 'Smith v. Acme',
                'description': 'External litigation',
                'referenceNumber': 'CASE-2026-0042',
                'holdType': LegalHold.HoldType.LITIGATION,
                'appliesToAll': False,
                'entityTypes': ['interactions', 'audit_logs'],
                'userIdentifiers': ['user-42', 'user-43'],
                'expirationDate': '2027-01-01T00:00:00+00:00',
                'custodianEmail': 'legal@example.com',
                'notifyOnAccess': True,
                'notificationEmails': ['ops@example.com'],
                'metadata': {'priority': 'high'},
            },
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['createLegalHold']
        self.assertTrue(payload['success'], msg=payload.get('errors'))

        hold = LegalHold.objects.get(pk=payload['holdId'])
        self.assertEqual(hold.hold_type, LegalHold.HoldType.LITIGATION)
        self.assertEqual(hold.reference_number, 'CASE-2026-0042')
        self.assertEqual(sorted(hold.entity_types), ['audit_logs', 'interactions'])
        self.assertEqual(sorted(hold.user_identifiers), ['user-42', 'user-43'])
        self.assertEqual(hold.custodian_email, 'legal@example.com')
        self.assertTrue(hold.notify_on_access)
        self.assertEqual(hold.metadata.get('priority'), 'high')

    def test_create_unauthenticated_rejected(self):
        # Unauthenticated should raise (mutation uses GraphQLError)
        result = _exec(CREATE_HOLD, {'input': {'name': 'NoAuth'}}, context=anon_context())
        self.assertIsNotNone(result.errors)
        self.assertIn('Authentication required', str(result.errors[0]))
        self.assertEqual(LegalHold.objects.count(), 0)


class UpdateLegalHoldTests(TestCase):

    def setUp(self):
        self.hold = LegalHold.objects.create(
            tenant_id=STANDALONE_TENANT, name='Original',
            description='before', hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.ACTIVE, user_id='1',
        )

    def test_update_basic_fields(self):
        result = _exec(UPDATE_HOLD, {
            'input': {
                'id': str(self.hold.id),
                'name': 'Renamed Hold',
                'description': 'after',
                'referenceNumber': 'REF-1',
            },
        })
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['updateLegalHold']
        self.assertTrue(payload['success'], msg=payload.get('errors'))

        self.hold.refresh_from_db()
        self.assertEqual(self.hold.name, 'Renamed Hold')
        self.assertEqual(self.hold.description, 'after')
        self.assertEqual(self.hold.reference_number, 'REF-1')

    def test_update_partial_keeps_other_fields(self):
        original_desc = self.hold.description
        result = _exec(UPDATE_HOLD, {
            'input': {'id': str(self.hold.id), 'name': 'JustName'},
        })
        self.assertIsNone(result.errors)
        self.assertTrue(result.data['updateLegalHold']['success'])

        self.hold.refresh_from_db()
        self.assertEqual(self.hold.name, 'JustName')
        # Untouched
        self.assertEqual(self.hold.description, original_desc)

    def test_update_unknown_returns_not_found(self):
        result = _exec(UPDATE_HOLD, {
            'input': {
                'id': '00000000-0000-0000-0000-000000000999',
                'name': 'NoOp',
            },
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateLegalHold']
        self.assertFalse(payload['success'])
        self.assertIn('Legal hold not found', payload['errors'])

    def test_update_other_tenant_returns_not_found(self):
        # Different tenant's hold must not be reachable
        other = LegalHold.objects.create(
            tenant_id='other-tenant', name='Other',
            hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.ACTIVE,
        )
        result = _exec(UPDATE_HOLD, {
            'input': {'id': str(other.id), 'name': 'Hijacked'},
        })
        self.assertIsNone(result.errors)
        payload = result.data['updateLegalHold']
        self.assertFalse(payload['success'])
        self.assertIn('Legal hold not found', payload['errors'])

        # Other tenant's hold not modified
        other.refresh_from_db()
        self.assertEqual(other.name, 'Other')


class ReleaseLegalHoldTests(TestCase):

    def setUp(self):
        self.hold = LegalHold.objects.create(
            tenant_id=STANDALONE_TENANT, name='Active Hold',
            hold_type=LegalHold.HoldType.LITIGATION,
            status=LegalHold.HoldStatus.ACTIVE, user_id='1',
        )

    def test_release_marks_status_and_records_release_metadata(self):
        self.assertIsNone(self.hold.released_at)

        result = _exec(RELEASE_HOLD, {'id': str(self.hold.id)})
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['releaseLegalHold']
        self.assertTrue(payload['success'])

        self.hold.refresh_from_db()
        self.assertEqual(self.hold.status, LegalHold.HoldStatus.RELEASED)
        self.assertIsNotNone(self.hold.released_at)
        # Release audit metadata is captured (regression test for the
        # ``released_by`` FK removal — previously crashed save())
        self.assertEqual(
            self.hold.metadata.get('released_by_user_id'),
            '1',
        )

    def test_release_unknown_raises(self):
        result = _exec(RELEASE_HOLD, {'id': '00000000-0000-0000-0000-000000000999'})
        self.assertIsNotNone(result.errors)
        self.assertIn('Legal hold not found', str(result.errors[0]))

    def test_release_other_tenant_isolation(self):
        other = LegalHold.objects.create(
            tenant_id='other-tenant', name='OtherTenantHold',
            hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.ACTIVE,
        )
        result = _exec(RELEASE_HOLD, {'id': str(other.id)})
        # Tenant scoping causes a "not found" lookup
        self.assertIsNotNone(result.errors)
        self.assertIn('Legal hold not found', str(result.errors[0]))

        other.refresh_from_db()
        self.assertEqual(other.status, LegalHold.HoldStatus.ACTIVE)


class DeleteLegalHoldTests(TestCase):

    def test_delete_active_hold_blocked(self):
        hold = LegalHold.objects.create(
            tenant_id=STANDALONE_TENANT, name='Active',
            hold_type=LegalHold.HoldType.LITIGATION,
            status=LegalHold.HoldStatus.ACTIVE,
        )
        result = _exec(DELETE_HOLD, {'id': str(hold.id)})
        self.assertIsNone(result.errors)
        payload = result.data['deleteLegalHold']
        self.assertFalse(payload['success'])
        self.assertTrue(any('active legal hold' in e.lower() for e in payload['errors']))
        # Still in DB
        self.assertTrue(LegalHold.objects.filter(id=hold.id).exists())

    def test_delete_released_hold_succeeds(self):
        hold = LegalHold.objects.create(
            tenant_id=STANDALONE_TENANT, name='Released',
            hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.RELEASED,
            released_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        result = _exec(DELETE_HOLD, {'id': str(hold.id)})
        self.assertIsNone(result.errors, msg=str(result.errors))
        self.assertTrue(result.data['deleteLegalHold']['success'])
        self.assertFalse(LegalHold.objects.filter(id=hold.id).exists())

    def test_delete_unknown(self):
        result = _exec(DELETE_HOLD, {'id': '00000000-0000-0000-0000-000000000999'})
        self.assertIsNone(result.errors)
        payload = result.data['deleteLegalHold']
        self.assertFalse(payload['success'])
        self.assertIn('Legal hold not found', payload['errors'])

    def test_delete_other_tenant_isolation(self):
        # Build a released hold in another tenant — must still appear "not found"
        other = LegalHold.objects.create(
            tenant_id='other-tenant', name='OtherReleased',
            hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.RELEASED,
            released_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        result = _exec(DELETE_HOLD, {'id': str(other.id)})
        self.assertIsNone(result.errors)
        payload = result.data['deleteLegalHold']
        self.assertFalse(payload['success'])
        self.assertIn('Legal hold not found', payload['errors'])
        # Still present
        self.assertTrue(LegalHold.objects.filter(id=other.id).exists())

    def test_delete_unauthenticated_rejected(self):
        hold = LegalHold.objects.create(
            tenant_id=STANDALONE_TENANT, name='ReleasedForAnonTest',
            hold_type=LegalHold.HoldType.PRESERVATION,
            status=LegalHold.HoldStatus.RELEASED,
            released_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        result = _exec(
            DELETE_HOLD, {'id': str(hold.id)}, context=anon_context(),
        )
        self.assertIsNotNone(result.errors)
        self.assertIn('Authentication required', str(result.errors[0]))
        self.assertTrue(LegalHold.objects.filter(id=hold.id).exists())
