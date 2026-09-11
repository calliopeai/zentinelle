import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from zentinelle.api.views.runtime_settings import (RuntimeSettingsChangesView,
                                                    RuntimeSettingsChangeTransitionView,
                                                    RuntimeSettingsRollbackView, RuntimeSettingsView)
from zentinelle.models import RuntimeSettingsChange, RuntimeSettingsRevision, TenantConfig


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

        stale = self.factory.post('/settings/runtime/rollback', data=json.dumps({'revision': 2, 'expected_revision': 0}), content_type='application/json')
        stale.user = self.user
        self.assertEqual(RuntimeSettingsRollbackView.as_view()(stale).status_code, 409)

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_patch_rejects_unbounded_or_malformed_values(self, _tenant):
        request = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'assistant_model': 'x' * 129}}), content_type='application/json')
        request.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(request).status_code, 400)

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_exposes_and_validates_model_operations_defaults(self, _tenant):
        request = self.factory.get('/settings/runtime')
        request.user = self.user
        data = json.loads(RuntimeSettingsView.as_view()(request).content)
        self.assertEqual(data['settings']['model_visibility'], 'enabled_only')
        self.assertEqual(data['settings']['discovery_refresh_seconds'], 3600)
        self.assertEqual(data['effective']['model_visibility']['source'], 'default')
        self.assertIsNone(data['effective']['model_visibility']['changed_at'])

        invalid = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'model_visibility': 'secret'}}), content_type='application/json')
        invalid.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(invalid).status_code, 400)

        valid = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'model_visibility': 'approved_only', 'discovery_refresh_seconds': 900, 'default_rate_limit_per_minute': 120, 'default_budget_cents': 5000}}), content_type='application/json')
        valid.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(valid).status_code, 200)
        refreshed = self.factory.get('/settings/runtime')
        refreshed.user = self.user
        effective = json.loads(RuntimeSettingsView.as_view()(refreshed).content)['effective']
        self.assertEqual(effective['model_visibility']['source'], 'tenant')
        self.assertEqual(effective['model_visibility']['changed_by']['name'], 'settings-admin')
        later = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'default_budget_cents': 10}}), content_type='application/json')
        later.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(later).status_code, 200)
        refreshed = self.factory.get('/settings/runtime')
        refreshed.user = self.user
        effective = json.loads(RuntimeSettingsView.as_view()(refreshed).content)['effective']
        self.assertEqual(effective['model_visibility']['changed_by']['name'], 'settings-admin')

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_runtime_change_requires_explicit_approval_before_apply(self, _tenant):
        request = self.factory.post('/settings/runtime/changes', data=json.dumps({'settings': {'assistant_model': 'gpt-5'}}), content_type='application/json')
        request.user = self.user
        created = RuntimeSettingsChangesView.as_view()(request)
        self.assertEqual(created.status_code, 201)
        change_id = json.loads(created.content)['id']
        apply = self.factory.post('/settings/runtime/changes/%s/transition' % change_id, data=json.dumps({'status': 'applied'}), content_type='application/json')
        apply.user = self.user
        self.assertEqual(RuntimeSettingsChangeTransitionView.as_view()(apply, change_id=change_id).status_code, 409)
        stage_to_approved = self.factory.post('/settings/runtime/changes/%s/transition' % change_id, data=json.dumps({'status': 'approved'}), content_type='application/json')
        stage_to_approved.user = self.user
        # A staged proposal can be approved by an administrator.
        self.assertEqual(RuntimeSettingsChangeTransitionView.as_view()(stage_to_approved, change_id=change_id).status_code, 200)
        apply = self.factory.post('/settings/runtime/changes/%s/transition' % change_id, data=json.dumps({'status': 'applied'}), content_type='application/json')
        apply.user = self.user
        self.assertEqual(RuntimeSettingsChangeTransitionView.as_view()(apply, change_id=change_id).status_code, 200)
        self.assertEqual(TenantConfig.objects.get(tenant_id='tenant-a').settings['assistant_model'], 'gpt-5')
        request = self.factory.patch('/settings/runtime', data=json.dumps({'settings': {'taxonomy_extensions': ['invalid']}}), content_type='application/json')
        request.user = self.user
        self.assertEqual(RuntimeSettingsView.as_view()(request).status_code, 400)

    @patch('zentinelle.api.views.runtime_settings._tenant_id', return_value='tenant-a')
    def test_staged_change_rejects_values_that_direct_patch_rejects(self, _tenant):
        for settings in ({'content_capture_mode': 'unsafe'}, {'assistant_allowed_topics': 'support'},
                         {'taxonomy_extensions': ['invalid']}, {'control_approval_required': 'yes'}):
            request = self.factory.post('/settings/runtime/changes', data=json.dumps({'settings': settings}), content_type='application/json')
            request.user = self.user
            self.assertEqual(RuntimeSettingsChangesView.as_view()(request).status_code, 400)
