"""
Tests for compliance pack GraphQL mutations.

Covers: listCompliancePacks, activateCompliancePack.

Note: the underlying ``activate_pack`` service is unit-tested separately in
test_compliance_packs.py with full mocks. These tests exercise the GraphQL
mutation wrapper end-to-end against a real database, so policy rows are
actually created.
"""
from django.test import TestCase

from zentinelle.models import Policy
from zentinelle.schema import schema
from zentinelle.tests._graphql_helpers import (
    STANDALONE_TENANT,
    admin_context,
    anon_context,
)


LIST_PACKS = """
mutation { listCompliancePacks { success packs { name displayName version policyCount } } }
"""

ACTIVATE_PACK = """
mutation Activate($packId: String!) {
  activateCompliancePack(packId: $packId) {
    success
    error
    packName
    packVersion
    policiesCreated
    policiesUpdated
  }
}
"""


def _exec(query, variables=None, context=None):
    return schema.execute_sync(
        query,
        variable_values=variables or {},
        context_value=context or admin_context(),
    )


class ListCompliancePacksTests(TestCase):

    def test_list_returns_known_packs(self):
        result = _exec(LIST_PACKS)
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['listCompliancePacks']
        self.assertTrue(payload['success'])
        names = {p['name'] for p in payload['packs']}
        # The five packs documented in test_compliance_packs.py
        self.assertEqual(
            names, {'hipaa', 'soc2', 'gdpr', 'eu_ai_act', 'nist_ai_rmf'},
        )

    def test_list_metadata_shape(self):
        result = _exec(LIST_PACKS)
        for pack in result.data['listCompliancePacks']['packs']:
            self.assertIsNotNone(pack['displayName'])
            self.assertIsNotNone(pack['version'])
            self.assertGreater(pack['policyCount'], 0)

    def test_list_unauthenticated_returns_empty(self):
        result = _exec(LIST_PACKS, context=anon_context())
        self.assertIsNone(result.errors)
        payload = result.data['listCompliancePacks']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['packs'], [])


class ActivateCompliancePackTests(TestCase):

    def test_activate_hipaa_creates_policies(self):
        # Sanity precondition
        self.assertEqual(
            Policy.objects.filter(tenant_id=STANDALONE_TENANT).count(), 0,
        )

        result = _exec(ACTIVATE_PACK, {'packId': 'hipaa'})
        self.assertIsNone(result.errors, msg=str(result.errors))
        payload = result.data['activateCompliancePack']
        self.assertTrue(payload['success'], msg=payload.get('error'))
        self.assertEqual(payload['packName'], 'hipaa')
        self.assertGreater(payload['policiesCreated'], 0)
        self.assertEqual(payload['policiesUpdated'], 0)

        # Verify policies were actually persisted, scoped to the tenant
        created = Policy.objects.filter(tenant_id=STANDALONE_TENANT)
        self.assertEqual(created.count(), payload['policiesCreated'])

    def test_activate_idempotent_updates_on_second_call(self):
        # First activation creates
        first = _exec(ACTIVATE_PACK, {'packId': 'soc2'})
        self.assertTrue(first.data['activateCompliancePack']['success'])
        created_count = first.data['activateCompliancePack']['policiesCreated']

        # Second activation updates (no new rows)
        second = _exec(ACTIVATE_PACK, {'packId': 'soc2'})
        payload = second.data['activateCompliancePack']
        self.assertTrue(payload['success'])
        self.assertEqual(payload['policiesCreated'], 0)
        self.assertEqual(payload['policiesUpdated'], created_count)

    def test_activate_unknown_pack_returns_error(self):
        result = _exec(ACTIVATE_PACK, {'packId': 'iso27001_nonexistent'})
        self.assertIsNone(result.errors)
        payload = result.data['activateCompliancePack']
        self.assertFalse(payload['success'])
        self.assertIn('iso27001_nonexistent', payload['error'])

        # No policies created
        self.assertEqual(Policy.objects.count(), 0)

    def test_activate_unauthenticated_rejected(self):
        result = _exec(ACTIVATE_PACK, {'packId': 'hipaa'}, context=anon_context())
        self.assertIsNone(result.errors)
        payload = result.data['activateCompliancePack']
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'Authentication required')
        self.assertEqual(Policy.objects.count(), 0)

    def test_activate_scopes_policies_to_request_tenant(self):
        # Pack policies must be created under the *requesting user's* tenant_id,
        # not under any other tenant in the database.
        Policy.objects.create(
            tenant_id='other-tenant', name='Existing', policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION, enforcement=Policy.Enforcement.ENFORCE,
            config={},
        )

        result = _exec(ACTIVATE_PACK, {'packId': 'gdpr'})
        self.assertIsNone(result.errors)
        self.assertTrue(result.data['activateCompliancePack']['success'])

        # All newly created policies must belong to STANDALONE_TENANT, not
        # the unrelated 'other-tenant' row that already existed.
        new_policies = Policy.objects.exclude(name='Existing')
        self.assertGreater(new_policies.count(), 0)
        for p in new_policies:
            self.assertEqual(p.tenant_id, STANDALONE_TENANT)
