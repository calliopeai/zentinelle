import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from zentinelle.api.views.runtime_settings import RuntimeSettingsRollbackView, RuntimeSettingsView
from zentinelle.models import RuntimeSettingsRevision, TenantConfig


class RuntimeSettingsRevisionTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = User.objects.create_superuser('settings-admin', 'admin@example.test', 'password')

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_patch_versions_and_rejects_stale_revision(self, _tenant):
        request = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'assistant_model': 'gpt-5'}}), content_type='application/json')
        request.user = self.user
        response = RuntimeSettingsView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)['revision'], 1)
        self.assertEqual(RuntimeSettingsRevision.objects.get(tenant_id='tenant-a').actor_name, 'settings-admin')

        stale = self.factory.patch('/settings/runtime', data=json.dumps({'expected_revision': 0, 'settings': {'assistant_model': 'other'}}), content_type='application/json')
        stale.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(stale).status_code, 409)

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_rollback_creates_new_revision_and_restores_snapshot(self, _tenant):
        TenantConfig.objects.create(tenant_id='tenant-a', settings={'assistant_model': 'first'})
        RuntimeSettingsRevision.objects.create(tenant_id='tenant-a', revision=1, settings={'assistant_model': 'first'})
        RuntimeSettingsRevision.objects.create(tenant_id='tenant-a', revision=2, settings={'assistant_model': 'second'})
        request = self.factory.post('/settings/runtime/rollback', data=json.dumps({'revision': 1}), content_type='application/json')
        request.user = self.user
        response = RuntimeSettingsRollbackView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)['revision'], 3)
        self.assertEqual(TenantConfig.objects.get(tenant_id='tenant-a').settings['assistant_model'], 'first')
