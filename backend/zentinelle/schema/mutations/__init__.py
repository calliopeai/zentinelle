"""
Zentinelle GraphQL Mutations.

Standalone version — deployment-related mutations (ai_keys, deployment,
deployment_ops, junohub) are excluded as they depend on external apps.

All mutations are Strawberry-based standalone functions.
"""
from datetime import datetime
from typing import Optional

import strawberry

from .endpoint import (  # noqa: F401
    create_agent_endpoint,
    update_agent_endpoint,
    delete_agent_endpoint,
    suspend_agent_endpoint,
    activate_agent_endpoint,
    regenerate_endpoint_api_key,
    update_endpoint_status,
    CreateAgentEndpointInput,
    UpdateAgentEndpointInput,
    CreateAgentEndpointPayload,
    UpdateAgentEndpointPayload,
    DeleteAgentEndpointPayload,
    SuspendAgentEndpointPayload,
    ActivateAgentEndpointPayload,
    RegenerateEndpointApiKeyPayload,
    UpdateEndpointStatusPayload,
)
from .policy import (  # noqa: F401
    create_policy,
    update_policy,
    delete_policy,
    duplicate_policy,
    toggle_policy_enabled,
    CreatePolicyInput,
    UpdatePolicyInput,
    CreatePolicyPayload,
    UpdatePolicyPayload,
    DeletePolicyPayload,
    DuplicatePolicyPayload,
    TogglePolicyEnabledPayload,
)
from .compliance import (  # noqa: F401
    run_compliance_check,
    generate_compliance_report,
    toggle_framework,
    RunComplianceCheckPayload,
    GenerateComplianceReportPayload,
    ComplianceFrameworkOutput,
    ToggleFrameworkPayload,
)
from .compliance_alerts import (  # noqa: F401
    acknowledge_compliance_alert,
    resolve_compliance_alert,
    dismiss_compliance_alert,
    AcknowledgeComplianceAlertPayload,
    ResolveComplianceAlertPayload,
    DismissComplianceAlertPayload,
)
from .policy_document import (  # noqa: F401
    upload_policy_document,
    analyze_policy_document,
    delete_policy_document,
    retry_policy_document,
    PolicyDocumentType,
    ExtractedPromptType,
    UploadPolicyDocumentPayload,
    AnalyzePolicyDocumentPayload,
    DeletePolicyDocumentPayload,
    RetryPolicyDocumentPayload,
)
from .risk import (  # noqa: F401
    create_risk,
    update_risk,
    delete_risk,
    review_risk,
    create_incident,
    update_incident,
    acknowledge_incident,
    resolve_incident,
    close_incident,
    assign_incident,
    CreateRiskInput,
    UpdateRiskInput,
    CreateRiskPayload,
    UpdateRiskPayload,
    DeleteRiskPayload,
    ReviewRiskPayload,
    CreateIncidentInput,
    UpdateIncidentInput,
    CreateIncidentPayload,
    UpdateIncidentPayload,
    AcknowledgeIncidentPayload,
    ResolveIncidentPayload,
    CloseIncidentPayload,
    AssignIncidentPayload,
)
from .retention import (  # noqa: F401
    create_retention_policy,
    update_retention_policy,
    delete_retention_policy,
    toggle_retention_policy_enabled,
    create_legal_hold,
    update_legal_hold,
    release_legal_hold,
    delete_legal_hold,
    CreateRetentionPolicyInput,
    UpdateRetentionPolicyInput,
    CreateRetentionPolicyPayload,
    UpdateRetentionPolicyPayload,
    DeleteRetentionPolicyPayload,
    ToggleRetentionPolicyEnabledPayload,
    CreateLegalHoldInput,
    UpdateLegalHoldInput,
    CreateLegalHoldPayload,
    UpdateLegalHoldPayload,
    ReleaseLegalHoldPayload,
    DeleteLegalHoldPayload,
)
from .content_rules import (  # noqa: F401
    create_content_rule,
    update_content_rule,
    delete_content_rule,
    toggle_content_rule_enabled,
    duplicate_content_rule,
    test_content_rule,
    CreateContentRuleInput,
    UpdateContentRuleInput,
    CreateContentRulePayload,
    UpdateContentRulePayload,
    DeleteContentRulePayload,
    ToggleContentRuleEnabledPayload,
    DuplicateContentRulePayload,
    TestContentRulePayload,
)
from .license_hierarchy import (  # noqa: F401
    create_child_license,
    update_child_entitlements,
    transfer_child_license,
    revoke_child_license,
    propagate_parent_entitlements,
    get_license_hierarchy,
    LicenseHierarchyType,
    LicenseType,
    CreateChildLicenseInput,
    UpdateChildEntitlementsInput,
    TransferChildLicenseInput,
    CreateChildLicensePayload,
    UpdateChildEntitlementsPayload,
    TransferChildLicensePayload,
    RevokeChildLicensePayload,
    PropagateParentEntitlementsPayload,
    GetLicenseHierarchyPayload,
)
from .api_keys_platform import (  # noqa: F401
    create_platform_api_key,
    revoke_api_key,
    delete_api_key,
    CreatePlatformAPIKeyPayload,
    RevokeAPIKeyPayload,
    DeleteAPIKeyPayload,
)
from .prompts import (  # noqa: F401
    create_system_prompt,
    update_system_prompt,
    delete_system_prompt,
    fork_system_prompt,
    toggle_prompt_favorite,
    rate_system_prompt,
    CreateSystemPromptInput,
    UpdateSystemPromptInput,
    SystemPromptPayload,
    TogglePromptFavoritePayload,
    RatePromptPayload,
    DeletePromptPayload,
)
from .integration import (  # noqa: F401
    test_client_cove_connection,
    save_client_cove_config,
    disconnect_client_cove,
    test_webhook,
)
from .compliance_packs import (  # noqa: F401
    activate_compliance_pack,
    list_compliance_packs,
    CompliancePackMetaType,
    ActivateCompliancePackPayload,
    ListCompliancePacksPayload,
)
from .agent_groups import (  # noqa: F401
    create_agent_group,
    update_agent_group,
    delete_agent_group,
    assign_agent_to_group,
    CreateAgentGroupPayload,
    UpdateAgentGroupPayload,
    DeleteAgentGroupPayload,
    AssignAgentToGroupPayload,
)

from zentinelle.schema.types import (
    OrganizationType,
    UpdateOrganizationSettingsPayload,
    NotificationType,
)


@strawberry.input
class OrganizationSettingsInput:
    name: Optional[str] = None
    contact_email: Optional[str] = None
    timezone: Optional[str] = None
    email_notifications: Optional[bool] = None
    slack_notifications: Optional[bool] = None
    webhook_url: Optional[str] = None
    default_policy_mode: Optional[str] = None
    audit_logging: Optional[bool] = None


@strawberry.type
class UpdateNotificationPayload:
    notification: Optional[NotificationType] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class MarkAllNotificationsReadPayload:
    success: Optional[bool] = None
    count: Optional[int] = None


@strawberry.type
class ExportAuditLogsPayload:
    download_url: Optional[str] = None
    errors: list[str] = strawberry.field(default_factory=list)


def update_organization_settings(info: strawberry.types.Info, settings: OrganizationSettingsInput) -> UpdateOrganizationSettingsPayload:
    from zentinelle.schema.auth_helpers import get_request_tenant_id
    from zentinelle.models.tenant_config import TenantConfig
    tenant_id = get_request_tenant_id(info.context.request.user) or "default"

    settings_dict = {}
    for field_name in ['name', 'contact_email', 'timezone', 'email_notifications',
                       'slack_notifications', 'webhook_url', 'default_policy_mode', 'audit_logging']:
        val = getattr(settings, field_name, None)
        if val is not None:
            settings_dict[field_name] = val

    name = settings_dict.pop('name', None)

    config, _ = TenantConfig.objects.get_or_create(tenant_id=tenant_id)
    if name is not None:
        config.name = name or "My Organization"
    config.settings.update({k: v for k, v in settings_dict.items() if v is not None})
    config.save()

    org = OrganizationType(
        id=tenant_id,
        name=config.name,
        slug=tenant_id,
        tier="standard",
        website="",
        deployment_model="standalone",
        zentinelle_tier="community",
        ai_budget_usd=None,
        ai_budget_spent_usd=0.0,
        overage_policy="block",
        ai_budget_alert_threshold=0.8,
        settings=config.settings,
        created_at=config.updated_at,
    )
    return UpdateOrganizationSettingsPayload(success=True, organization=org)


def update_notification(info: strawberry.types.Info, id: strawberry.ID, status: str) -> UpdateNotificationPayload:
    from zentinelle.models.notification import Notification
    from zentinelle.schema.auth_helpers import get_request_tenant_id
    from django.utils import timezone
    tenant_id = get_request_tenant_id(info.context.request.user)
    try:
        n = Notification.objects.get(id=id, tenant_id=tenant_id)
        n.status = status
        n.status_date = timezone.now()
        n.save(update_fields=['status', 'status_date'])
        return UpdateNotificationPayload(notification=n, errors=[])
    except Notification.DoesNotExist:
        return UpdateNotificationPayload(notification=None, errors=["Notification not found."])


def mark_all_notifications_read(info: strawberry.types.Info) -> MarkAllNotificationsReadPayload:
    from zentinelle.models.notification import Notification
    from zentinelle.schema.auth_helpers import get_request_tenant_id
    from django.utils import timezone
    tenant_id = get_request_tenant_id(info.context.request.user)
    count = Notification.objects.filter(
        tenant_id=tenant_id,
        status=Notification.Status.UNREAD,
    ).update(status=Notification.Status.READ, status_date=timezone.now())
    return MarkAllNotificationsReadPayload(success=True, count=count)


def export_audit_logs(info: strawberry.types.Info, format: str, start_date: datetime, end_date: datetime) -> ExportAuditLogsPayload:
    if not info.context.request.user.is_authenticated:
        return ExportAuditLogsPayload(errors=["Authentication required"])
    fmt = format.lower()
    if fmt not in ('csv', 'ndjson', 'cef'):
        fmt = 'csv'
    from_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
    to_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
    url = f'/api/zentinelle/v1/audit/export/?format={fmt}&from={from_str}&to={to_str}'
    return ExportAuditLogsPayload(download_url=url)
