"""Tenant-scoped, allowlisted runtime settings for administrators."""
import json

from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAdminAccess
from zentinelle.auth.mode import is_open_mode
from zentinelle.models import RuntimeSettingsChange, RuntimeSettingsRevision, TenantConfig
from zentinelle.schema.auth_helpers import get_request_tenant_id

SETTING_DEFAULTS = {
    'assistant_allowed_topics': lambda: list(getattr(settings, 'ASSISTANT_ALLOWED_TOPICS', ())),
    'content_capture_mode': lambda: getattr(settings, 'CONTENT_CAPTURE_MODE', 'metadata'),
    'assistant_model': lambda: getattr(settings, 'ASSISTANT_MODEL', ''),
    'assistant_provider': lambda: getattr(settings, 'ASSISTANT_PROVIDER', ''),
    'taxonomy_extensions': lambda: [],
    'policy_copilot_enabled': lambda: False,
    'control_approval_required': lambda: False,
    # Safe operational knobs; bootstrap secrets and infrastructure URLs stay
    # environment managed. Bounds are enforced below before persistence.
    'discovery_refresh_seconds': lambda: 3600,
    'model_visibility': lambda: 'enabled_only',
    'default_rate_limit_per_minute': lambda: 60,
    'default_budget_cents': lambda: 0,
}

SETTING_SCHEMA = {
    key: {'scope': 'tenant', 'secret': False, 'runtime_managed': True}
    for key in SETTING_DEFAULTS
}
BOOTSTRAP_ONLY_SETTINGS = [
    'bootstrap secrets', 'database URLs', 'broker URLs', 'provider credentials',
    'encryption keys', 'OIDC client secrets',
]


def _tenant_id(request):
    tenant_id = get_request_tenant_id(request.user)
    if not tenant_id and is_open_mode():
        return '00000000-0000-0000-0000-000000000001'
    return tenant_id or ''


def _validate_updates(updates):
    """Return a bounded validation error for a proposed settings payload."""
    unknown = sorted(set(updates) - set(SETTING_DEFAULTS))
    if unknown:
        return 'Unknown or unsafe settings'
    if 'model_visibility' in updates and updates['model_visibility'] not in {'enabled_only', 'all_registered', 'approved_only'}:
        return 'model_visibility must be enabled_only, all_registered, or approved_only'
    if 'discovery_refresh_seconds' in updates and (not isinstance(updates['discovery_refresh_seconds'], int) or isinstance(updates['discovery_refresh_seconds'], bool) or not 300 <= updates['discovery_refresh_seconds'] <= 86400):
        return 'discovery_refresh_seconds must be an integer from 300 to 86400'
    for key, low, high in (('default_rate_limit_per_minute', 1, 100000), ('default_budget_cents', 0, 100000000)):
        if key in updates and (not isinstance(updates[key], int) or isinstance(updates[key], bool) or not low <= updates[key] <= high):
            return f'{key} must be an integer from {low} to {high}'
    if 'content_capture_mode' in updates and updates['content_capture_mode'] not in {'metadata', 'redacted', 'full'}:
        return 'content_capture_mode must be metadata, redacted, or full'
    if 'assistant_allowed_topics' in updates and (not isinstance(updates['assistant_allowed_topics'], list) or len(updates['assistant_allowed_topics']) > 100 or not all(isinstance(item, str) and 0 < len(item) <= 128 for item in updates['assistant_allowed_topics'])):
        return 'assistant_allowed_topics must contain at most 100 bounded strings'
    for key in ('assistant_model', 'assistant_provider'):
        if key in updates and (not isinstance(updates[key], str) or len(updates[key]) > 128):
            return f'{key} must be a bounded string'
    if 'taxonomy_extensions' in updates and (not isinstance(updates['taxonomy_extensions'], list) or len(updates['taxonomy_extensions']) > 200 or not all(isinstance(item, str) and 1 <= len(item) <= 128 and item.count(':') == 1 for item in updates['taxonomy_extensions'])):
        return 'taxonomy_extensions must be a list of strings'
    for key in ('policy_copilot_enabled', 'control_approval_required'):
        if key in updates and not isinstance(updates[key], bool):
            return f'{key} must be boolean'
    return None


class RuntimeSettingsView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = _tenant_id(request)
        config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        stored = config.settings if config else {}
        values = {key: stored.get(key, factory()) for key, factory in SETTING_DEFAULTS.items()}
        latest = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id).order_by('-revision').first()
        revisions = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id)[:20]
        all_revisions = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id).order_by('-revision')
        effective = {}
        for key in SETTING_DEFAULTS:
            changed = next((row for row in all_revisions if key in (row.settings or {})), None)
            effective[key] = {
                'value': values[key],
                'source': 'tenant' if key in stored else 'default',
                'changed_at': changed.created_at.isoformat() if changed else None,
                'changed_by': {'id': changed.actor_id, 'name': changed.actor_name} if changed else None,
            }
        pending = RuntimeSettingsChange.objects.filter(
            tenant_id=tenant_id,
            status__in=[RuntimeSettingsChange.Status.STAGED, RuntimeSettingsChange.Status.APPROVED],
        )[:20]
        return JsonResponse({'settings': values, 'allowedKeys': list(SETTING_DEFAULTS),
                             'settingSchema': SETTING_SCHEMA,
                             'bootstrapOnly': BOOTSTRAP_ONLY_SETTINGS,
                             'revision': latest.revision if latest else 0,
                             'effective': effective,
                             'pending': [_serialize_change(row) for row in pending],
                             'revisions': [{'revision': row.revision, 'actor_id': row.actor_id, 'actor_name': row.actor_name,
                                            'created_at': row.created_at.isoformat()} for row in revisions]})

    def patch(self, request):
        try:
            payload = json.loads(request.body)
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        updates = payload.get('settings')
        if not isinstance(updates, dict) or not updates:
            return JsonResponse({'error': 'settings object is required'}, status=400)
        validation_error = _validate_updates(updates)
        if validation_error:
            return JsonResponse({'error': validation_error}, status=400)
        unknown = sorted(set(updates) - set(SETTING_DEFAULTS))
        if unknown:
            return JsonResponse({'error': 'Unknown or unsafe settings', 'keys': unknown}, status=400)
        if 'model_visibility' in updates and updates['model_visibility'] not in {'enabled_only', 'all_registered', 'approved_only'}:
            return JsonResponse({'error': 'model_visibility must be enabled_only, all_registered, or approved_only'}, status=400)
        if 'discovery_refresh_seconds' in updates and (not isinstance(updates['discovery_refresh_seconds'], int) or isinstance(updates['discovery_refresh_seconds'], bool) or not 300 <= updates['discovery_refresh_seconds'] <= 86400):
            return JsonResponse({'error': 'discovery_refresh_seconds must be an integer from 300 to 86400'}, status=400)
        for key, low, high in (('default_rate_limit_per_minute', 1, 100000), ('default_budget_cents', 0, 100000000)):
            if key in updates and (not isinstance(updates[key], int) or isinstance(updates[key], bool) or not low <= updates[key] <= high):
                return JsonResponse({'error': f'{key} must be an integer from {low} to {high}'}, status=400)
        if 'content_capture_mode' in updates and updates['content_capture_mode'] not in {'metadata', 'redacted', 'full'}:
            return JsonResponse({'error': 'content_capture_mode must be metadata, redacted, or full'}, status=400)
        if 'assistant_allowed_topics' in updates and not isinstance(updates['assistant_allowed_topics'], list):
            return JsonResponse({'error': 'assistant_allowed_topics must be a list'}, status=400)
        if 'assistant_allowed_topics' in updates and (len(updates['assistant_allowed_topics']) > 100 or
                not all(isinstance(item, str) and 0 < len(item) <= 128 for item in updates['assistant_allowed_topics'])):
            return JsonResponse({'error': 'assistant_allowed_topics must contain at most 100 bounded strings'}, status=400)
        for key in ('assistant_model', 'assistant_provider'):
            if key in updates and (not isinstance(updates[key], str) or len(updates[key]) > 128):
                return JsonResponse({'error': f'{key} must be a bounded string'}, status=400)
        if 'taxonomy_extensions' in updates:
            if (not isinstance(updates['taxonomy_extensions'], list) or len(updates['taxonomy_extensions']) > 200 or
                    not all(isinstance(item, str) and 1 <= len(item) <= 128 and item.count(':') == 1
                            for item in updates['taxonomy_extensions'])):
                return JsonResponse({'error': 'taxonomy_extensions must be a list of strings'}, status=400)
        if 'policy_copilot_enabled' in updates and not isinstance(updates['policy_copilot_enabled'], bool):
            return JsonResponse({'error': 'policy_copilot_enabled must be boolean'}, status=400)
        if 'control_approval_required' in updates and not isinstance(updates['control_approval_required'], bool):
            return JsonResponse({'error': 'control_approval_required must be boolean'}, status=400)
        tenant_id = _tenant_id(request)
        expected = payload.get('expected_revision')
        actor = getattr(request, 'user', None)
        with transaction.atomic():
            config, _ = TenantConfig.objects.select_for_update().get_or_create(tenant_id=tenant_id)
            latest = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id).order_by('-revision').first()
            current_revision = latest.revision if latest else 0
            if expected is not None and expected != current_revision:
                return JsonResponse({'error': 'stale settings revision', 'revision': current_revision}, status=409)
            config.settings = {**config.settings, **updates}
            config.save(update_fields=['settings', 'updated_at'])
            revision = current_revision + 1
            RuntimeSettingsRevision.objects.create(tenant_id=tenant_id, revision=revision, settings=config.settings,
                actor_id=str(getattr(actor, 'pk', '') or ''), actor_name=str(getattr(actor, 'username', '') or ''))
            try:
                from zentinelle.models import AuditLog
                AuditLog.log(tenant_id=tenant_id, action='runtime_settings.changed',
                             resource_type='tenant_runtime_settings', resource_id=tenant_id,
                             ext_user_id=str(getattr(actor, 'pk', '') or ''),
                             changes={'keys': sorted(updates), 'revision': revision})
            except Exception:
                # Settings remain durable even if audit projection is unavailable.
                pass
        return JsonResponse({'settings': {key: config.settings.get(key, factory()) for key, factory in SETTING_DEFAULTS.items()}, 'revision': revision})


class RuntimeSettingsRollbackView(RuntimeSettingsView):
    def post(self, request):
        try:
            payload = json.loads(request.body)
            target = int(payload.get('revision'))
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'revision is required'}, status=400)
        tenant_id = _tenant_id(request)
        source = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id, revision=target).first()
        if source is None:
            return JsonResponse({'error': 'revision not found'}, status=404)
        body = json.dumps({'settings': source.settings, 'expected_revision': payload.get('expected_revision')}).encode()
        request._request._body = body
        request._request._stream = None
        return super().patch(request)


class RuntimeSettingsChangesView(APIView):
    """Create/list reviewable runtime settings proposals."""
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def get(self, request):
        tenant_id = _tenant_id(request)
        rows = RuntimeSettingsChange.objects.filter(tenant_id=tenant_id)[:30]
        return JsonResponse({'results': [_serialize_change(row) for row in rows]})

    def post(self, request):
        try:
            payload = json.loads(request.body or '{}')
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        updates = payload.get('settings')
        if not isinstance(updates, dict) or not updates:
            return JsonResponse({'error': 'settings object is required'}, status=400)
        validation_error = _validate_updates(updates)
        if validation_error:
            return JsonResponse({'error': validation_error}, status=400)
        unknown = sorted(set(updates) - set(SETTING_DEFAULTS))
        if unknown:
            return JsonResponse({'error': 'Unknown or unsafe settings', 'keys': unknown}, status=400)
        if 'model_visibility' in updates and updates['model_visibility'] not in {'enabled_only', 'all_registered', 'approved_only'}:
            return JsonResponse({'error': 'model_visibility must be enabled_only, all_registered, or approved_only'}, status=400)
        if 'discovery_refresh_seconds' in updates and (not isinstance(updates['discovery_refresh_seconds'], int) or isinstance(updates['discovery_refresh_seconds'], bool) or not 300 <= updates['discovery_refresh_seconds'] <= 86400):
            return JsonResponse({'error': 'discovery_refresh_seconds must be an integer from 300 to 86400'}, status=400)
        for key, low, high in (('default_rate_limit_per_minute', 1, 100000), ('default_budget_cents', 0, 100000000)):
            if key in updates and (not isinstance(updates[key], int) or isinstance(updates[key], bool) or not low <= updates[key] <= high):
                return JsonResponse({'error': f'{key} must be an integer from {low} to {high}'}, status=400)
        tenant_id = _tenant_id(request)
        latest = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id).order_by('-revision').first()
        actor = str(getattr(request.user, 'pk', '') or getattr(request.user, 'username', '') or 'operator')
        row = RuntimeSettingsChange.objects.create(tenant_id=tenant_id, settings=updates,
            base_revision=latest.revision if latest else 0, created_by=actor)
        row.transition(RuntimeSettingsChange.Status.STAGED, actor=actor)
        return JsonResponse(_serialize_change(row), status=201)


def _serialize_change(row):
    return {'id': str(row.id), 'tenant_id': row.tenant_id, 'status': row.status,
            'settings': row.settings, 'base_revision': row.base_revision,
            'created_by': row.created_by, 'approved_by': row.approved_by,
            'applied_revision': row.applied_revision,
            'created_at': row.created_at.isoformat(), 'updated_at': row.updated_at.isoformat()}


class RuntimeSettingsChangeTransitionView(APIView):
    authentication_classes = PORTAL_AUTH
    permission_classes = [PortalAdminAccess]

    def post(self, request, change_id):
        tenant_id = _tenant_id(request)
        try:
            row = RuntimeSettingsChange.objects.get(id=change_id, tenant_id=tenant_id)
        except RuntimeSettingsChange.DoesNotExist:
            return JsonResponse({'error': 'Runtime settings change not found'}, status=404)
        try:
            payload = json.loads(request.body or '{}')
            next_status = payload.get('status')
        except (TypeError, ValueError, json.JSONDecodeError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)
        actor = str(getattr(request.user, 'pk', '') or getattr(request.user, 'username', '') or 'operator')
        try:
            if next_status == RuntimeSettingsChange.Status.APPLIED:
                from zentinelle.services.runtime_settings_changes import apply_change
                row = apply_change(row.id, tenant_id, actor=actor)
            else:
                row.transition(next_status, actor=actor)
        except ValueError as exc:
            return JsonResponse({'error': str(exc)}, status=409)
        return JsonResponse(_serialize_change(row))
