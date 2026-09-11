"""Transactional staging and application of runtime settings."""
from django.db import transaction
from django.utils import timezone
from zentinelle.models import RuntimeSettingsChange, RuntimeSettingsRevision, TenantConfig


def apply_change(change_id, tenant_id, *, actor=''):
    with transaction.atomic():
        change = RuntimeSettingsChange.objects.select_for_update().get(id=change_id, tenant_id=tenant_id)
        if change.status != RuntimeSettingsChange.Status.APPROVED:
            raise ValueError('Only approved runtime settings changes can be applied')
        latest = RuntimeSettingsRevision.objects.filter(tenant_id=tenant_id).order_by('-revision').first()
        current = latest.revision if latest else 0
        if current != change.base_revision:
            raise ValueError('Runtime settings changed since this proposal was staged; revalidate before applying')
        config, _ = TenantConfig.objects.select_for_update().get_or_create(tenant_id=tenant_id)
        config.settings = {**(config.settings or {}), **change.settings}
        config.save(update_fields=['settings', 'updated_at'])
        revision = current + 1
        RuntimeSettingsRevision.objects.create(
            tenant_id=tenant_id, revision=revision, settings=config.settings,
            actor_id=actor, actor_name=actor,
        )
        if {'discovery_refresh_seconds', 'assistant_provider', 'assistant_model', 'model_visibility'} & set(change.settings):
            from zentinelle.services.llm_model_discovery import clear_cache
            clear_cache(tenant_id=tenant_id)
        # Runtime feature/authority changes should not leave policy decisions
        # cached past the applied revision.
        try:
            from zentinelle.services.policy_engine import PolicyEngine
            PolicyEngine().invalidate_cache(tenant_id)
        except Exception:
            pass
        change.applied_revision = revision
        change.transition(RuntimeSettingsChange.Status.APPLIED, actor=actor)
        try:
            from zentinelle.models import AuditLog
            AuditLog.log(tenant_id=tenant_id, action='runtime_settings.applied',
                         resource_type='runtime_settings_change', resource_id=str(change.id),
                         ext_user_id=actor, changes={'revision': revision, 'keys': sorted(change.settings)})
        except Exception:
            pass
        return change
