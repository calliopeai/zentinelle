from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_ADMIN, assign_role


class ModelRouteCanaryTests(TestCase):
    def test_canary_uses_runtime_guard_and_has_no_provider_side_effect(self):
        user = User.objects.create_user('route-admin')
        assign_role(user, ROLE_ADMIN)
        client = APIClient(); client.force_authenticate(user=user)
        with patch('zentinelle.api.views.model_route_canary.get_request_tenant_id', return_value='tenant-a'), \
             patch('zentinelle.services.llm_provider._check_model_route') as check:
            response = client.post('/api/zentinelle/v1/models/route-canary', {'provider': 'openai', 'model': 'gpt-4o'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['allowed'])
        self.assertFalse(response.json()['side_effects'])
        self.assertTrue(response.json()['trace_id'])
        from zentinelle.models import ModelRouteCanary
        self.assertEqual(ModelRouteCanary.objects.filter(tenant_id='tenant-a').count(), 1)
        check.assert_called_once_with('gpt-4o', 'openai', 'tenant-a')

    def test_canary_reports_guard_denial(self):
        user = User.objects.create_user('route-admin-deny')
        assign_role(user, ROLE_ADMIN)
        client = APIClient(); client.force_authenticate(user=user)
        with patch('zentinelle.api.views.model_route_canary.get_request_tenant_id', return_value='tenant-a'), \
             patch('zentinelle.services.llm_provider._check_model_route', side_effect=RuntimeError('denied')):
            response = client.post('/api/zentinelle/v1/models/route-canary', {'provider': 'openai', 'model': 'gpt-4o'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['allowed'])
        self.assertEqual(response.json()['decision'], 'deny')
        self.assertTrue(response.json()['trace_id'])

    def test_rollback_is_tenant_scoped_and_idempotency_is_explicit(self):
        user = User.objects.create_user('route-admin-rollback')
        assign_role(user, ROLE_ADMIN)
        client = APIClient(); client.force_authenticate(user=user)
        with patch('zentinelle.api.views.model_route_canary.get_request_tenant_id', return_value='tenant-a'), \
             patch('zentinelle.services.llm_provider._check_model_route'):
            created = client.post('/api/zentinelle/v1/models/route-canary', {'provider': 'openai', 'model': 'gpt-4o'}, format='json')
        canary_id = created.json()['id']
        with patch('zentinelle.api.views.model_route_canary.get_request_tenant_id', return_value='tenant-b'):
            self.assertEqual(client.post(f'/api/zentinelle/v1/models/route-canary/{canary_id}/rollback').status_code, 404)
        with patch('zentinelle.api.views.model_route_canary.get_request_tenant_id', return_value='tenant-a'):
            rolled = client.post(f'/api/zentinelle/v1/models/route-canary/{canary_id}/rollback')
            self.assertEqual(rolled.status_code, 200)
            self.assertEqual(rolled.json()['status'], 'rolled_back')
            self.assertEqual(client.post(f'/api/zentinelle/v1/models/route-canary/{canary_id}/rollback').status_code, 409)
