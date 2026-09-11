from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from zentinelle.models import BudgetCharge


class BudgetShowbackTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('showback-admin')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        BudgetCharge.objects.create(
            tenant_id='tenant-a', endpoint_id_ext='00000000-0000-0000-0000-000000000001',
            team_id_ext='team-red', app_id_ext='app-1', session_id_ext='session-1',
            task_id_ext='task-1', request_id='r1', amount_usd=Decimal('1.00'),
            actual_usd=Decimal('0.25'), account_ids=[],
        )

    @patch('zentinelle.api.views.budget_showback.get_request_tenant_id', return_value='tenant-a')
    def test_showback_groups_by_team_and_preserves_tenant_scope(self, _tenant):
        response = self.client.get('/api/zentinelle/v1/budgets/showback?group_by=team')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['entries'][0]['dimension_id'], 'team-red')
        self.assertEqual(response.json()['entries'][0]['actual_usd'], 0.25)
