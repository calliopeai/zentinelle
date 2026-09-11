from decimal import Decimal
import uuid
from datetime import date

from django.test import TestCase

from zentinelle.models import BudgetAccount, BudgetCharge
from zentinelle.services.budget_reconciliation import (cancel_charge, clear_provider_usage_verifiers,
                                                        reconcile_charge, register_provider_usage_verifier)


class BudgetReconciliationTests(TestCase):
    def setUp(self):
        register_provider_usage_verifier('fixture', lambda usage, tenant, request_id: usage.get('attestation') == 'trusted')

    def tearDown(self):
        clear_provider_usage_verifiers()

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
            provider_usage={'provider': 'fixture', 'request_id': 'req-1', 'attestation': 'trusted', 'model': 'gpt-4o-mini', 'input_tokens': 1000, 'output_tokens': 1000},
        )
        account.refresh_from_db()
        self.assertEqual(result.reconciliation_source, 'provider-api:fixture')
        self.assertIsNotNone(result.reconciled_at)
        self.assertLess(account.committed_usd, Decimal('1.00000000'))
        self.assertEqual(reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={
            'model': 'gpt-4o-mini', 'input_tokens': 1000, 'output_tokens': 1000,
            'provider': 'fixture', 'request_id': 'req-1', 'attestation': 'trusted',
        }).id, charge.id)

    def test_agent_telemetry_cannot_reconcile(self):
        with self.assertRaisesRegex(ValueError, 'authenticated provider'):
            reconcile_charge('not-used', tenant_id='tenant-a', provider_usage={}, source='agent-telemetry')

    def test_provider_request_id_cannot_attach_usage_to_another_charge(self):
        account = BudgetAccount.objects.create(
            tenant_id='tenant-a', policy_id_ext='00000000-0000-0000-0000-000000000001',
            period='2026-09-01', committed_usd=Decimal('1.00000000'),
        )
        charge = BudgetCharge.objects.create(
            tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000002',
            request_id='reserved-1', amount_usd=Decimal('1.00000000'), account_ids=[account.id],
        )
        with self.assertRaisesRegex(ValueError, 'request_id'):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={
                'provider': 'fixture', 'request_id': 'different-request', 'model': 'gpt-4o-mini',
                'input_tokens': 1, 'output_tokens': 1,
            })
        charge.refresh_from_db()
        self.assertIsNone(charge.reconciled_at)

    def test_provider_request_id_is_required_for_reconciliation(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext=uuid.uuid4(), period=date.today())
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext=uuid.uuid4(), request_id='required-id', amount_usd=Decimal('1.00'), account_ids=[account.id])
        with self.assertRaisesRegex(ValueError, 'request_id'):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={
                'provider': 'fixture', 'attestation': 'trusted', 'billed_usd': '0.01',
            })

    def test_non_finite_billing_and_unbounded_tokens_are_rejected(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext=uuid.uuid4(), period=date.today())
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000002', request_id='req-bad', amount_usd=Decimal('1.00'), account_ids=[account.id])
        with self.assertRaises(ValueError):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={'provider': 'fixture', 'request_id': 'req-bad', 'attestation': 'trusted', 'billed_usd': 'NaN'})
        with self.assertRaisesRegex(ValueError, 'supported bound'):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={'provider': 'fixture', 'request_id': 'req-bad', 'attestation': 'trusted', 'model': 'gpt-4o-mini', 'input_tokens': 10_000_000_001, 'output_tokens': 0})

    def test_provider_billed_amount_supports_cache_and_hosted_tool_charges(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext='00000000-0000-0000-0000-000000000001', period='2026-09-01', committed_usd=Decimal('1.00'))
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000002', request_id='req-billed', amount_usd=Decimal('1.00'), account_ids=[account.id])
        result = reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={'provider': 'fixture', 'request_id': 'req-billed', 'attestation': 'trusted', 'billed_usd': '0.12500000'})
        self.assertEqual(result.actual_usd, Decimal('0.12500000'))
        self.assertEqual(BudgetAccount.objects.get(id=account.id).committed_usd, Decimal('0.12500000'))

    def test_provider_usage_above_reservation_is_anomaly_and_keeps_commitment(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext=uuid.uuid4(), period=date.today(), committed_usd=Decimal('1.00'))
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext=uuid.uuid4(), request_id='req-over', amount_usd=Decimal('1.00'), account_ids=[account.id])
        with self.assertRaisesRegex(ValueError, 'exceeds the reserved budget'):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={'provider': 'fixture', 'request_id': 'req-over', 'attestation': 'trusted', 'billed_usd': '1.01'})
        charge.refresh_from_db()
        account.refresh_from_db()
        self.assertIsNone(charge.reconciled_at)
        self.assertEqual(account.committed_usd, Decimal('1.00'))

    def test_provider_cancellation_releases_reservation_once(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext='00000000-0000-0000-0000-000000000001', period='2026-09-01', committed_usd=Decimal('1.00'))
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000002', request_id='req-cancel', amount_usd=Decimal('1.00'), account_ids=[account.id])
        result = cancel_charge(charge.id, tenant_id='tenant-a', provider_request_id='req-cancel', provider='fixture', attestation='trusted')
        self.assertEqual(result.actual_usd, Decimal('0'))
        self.assertEqual(BudgetAccount.objects.get(id=account.id).committed_usd, Decimal('0'))
        cancel_charge(charge.id, tenant_id='tenant-a', provider_request_id='req-cancel', provider='fixture', attestation='trusted')

    def test_unverified_provider_usage_cannot_release_reservation(self):
        account = BudgetAccount.objects.create(tenant_id='tenant-a', policy_id_ext=uuid.uuid4(), period=date.today())
        charge = BudgetCharge.objects.create(tenant_id='tenant-a', endpoint_id_ext=uuid.uuid4(), request_id='req', amount_usd=Decimal('1.00'), account_ids=[account.id])
        with self.assertRaisesRegex(ValueError, 'authenticated verification'):
            reconcile_charge(charge.id, tenant_id='tenant-a', provider_usage={
                'provider': 'fixture', 'request_id': 'req', 'attestation': 'forged', 'billed_usd': '0.01',
            })
