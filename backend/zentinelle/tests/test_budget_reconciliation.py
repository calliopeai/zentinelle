from decimal import Decimal

from django.test import TestCase

from zentinelle.models import BudgetAccount, BudgetCharge
from zentinelle.services.budget_reconciliation import reconcile_charge


class BudgetReconciliationTests(TestCase):
    def test_authenticated_provider_usage_releases_reservation_once(self):
        account = BudgetAccount.objects.create(
            tenant_id='tenant-a', policy_id_ext='00000000-0000-0000-0000-000000000001',
            period='2026-09-01', committed_usd=Decimal('1.00000000'),
        )
        charge = BudgetCharge.objects.create(
            tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000002',
            request_id='req-1', amount_usd=Decimal('1.00000000'), account_ids=[account.id],
        )
        result = reconcile_charge(
            charge.id, tenant_id='tenant-a',
            provider_usage={'model': 'gpt-4o-mini', 'input_tokens': 1000, 'output_tokens': 1000},
        )
        account.refresh_from_db()
        self.assertEqual(result.reconciliation_source, 'provider-api')
        self.assertIsNotNone(result.reconciled_at)
        self.assertLess(account.committed_usd, Decimal('1.00000000'))
        self.assertEqual(reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={
            'model': 'gpt-4o-mini', 'input_tokens': 1000, 'output_tokens': 1000,
        }).id, charge.id)

    def test_agent_telemetry_cannot_reconcile(self):
        with self.assertRaisesRegex(ValueError, 'authenticated provider'):
            reconcile_charge('not-used', tenant_id='tenant-a', provider_usage={}, source='agent-telemetry')
