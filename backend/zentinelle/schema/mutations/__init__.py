"""
Zentinelle GraphQL Mutations.

Standalone version — deployment-related mutations (ai_keys, deployment,
deployment_ops, junohub) are excluded as they depend on external apps.

All mutations are Strawberry-based standalone functions.
"""
from datetime import datetime
from typing import Optional

import strawberry

from zentinelle.schema.types import (NotificationType, OrganizationType,
                                     UpdateOrganizationSettingsPayload)

from .agent_groups import (AssignAgentToGroupPayload, CreateAgentGroupPayload,
                           DeleteAgentGroupPayload, UpdateAgentGroupPayload,
                           assign_agent_to_group, create_agent_group,
                           delete_agent_group, update_agent_group)
from .api_keys_platform import (CreatePlatformAPIKeyPayload,
                                DeleteAPIKeyPayload, RevokeAPIKeyPayload,
                                create_platform_api_key, delete_api_key,
                                revoke_api_key)
from .compliance import (ComplianceFrameworkOutput,
                         GenerateComplianceReportPayload,
                         RunComplianceCheckPayload, ToggleFrameworkPayload,
                         generate_compliance_report, run_compliance_check,
                         toggle_framework)
from .compliance_alerts import (AcknowledgeComplianceAlertPayload,
                                DismissComplianceAlertPayload,
                                ResolveComplianceAlertPayload,
                                acknowledge_compliance_alert,
                                dismiss_compliance_alert,
                                resolve_compliance_alert)
from .compliance_packs import (ActivateCompliancePackPayload,
                               CompliancePackMetaType,
                               ListCompliancePacksPayload,
                               activate_compliance_pack, list_compliance_packs)
from .content_rules import (CreateContentRuleInput, CreateContentRulePayload,
                            DeleteContentRulePayload,
                            DuplicateContentRulePayload,
                            TestContentRulePayload,
                            ToggleContentRuleEnabledPayload,
                            UpdateContentRuleInput, UpdateContentRulePayload,
                            create_content_rule, delete_content_rule,
                            duplicate_content_rule, test_content_rule,
                            toggle_content_rule_enabled, update_content_rule)
from .endpoint import (ActivateAgentEndpointPayload, CreateAgentEndpointInput,
                       CreateAgentEndpointPayload, DeleteAgentEndpointPayload,
                       RegenerateEndpointApiKeyPayload,
                       SuspendAgentEndpointPayload, UpdateAgentEndpointInput,
                       UpdateAgentEndpointPayload, UpdateEndpointStatusPayload,
                       activate_agent_endpoint, create_agent_endpoint,
                       delete_agent_endpoint, regenerate_endpoint_api_key,
                       suspend_agent_endpoint, update_agent_endpoint,
                       update_endpoint_status)
from .integration import (disconnect_client_cove, save_client_cove_config,
                          test_client_cove_connection, test_webhook)
from .license_hierarchy import (CreateChildLicenseInput,
                                CreateChildLicensePayload,
                                GetLicenseHierarchyPayload,
                                LicenseHierarchyType, LicenseType,
                                PropagateParentEntitlementsPayload,
                                RevokeChildLicensePayload,
                                TransferChildLicenseInput,
                                TransferChildLicensePayload,
                                UpdateChildEntitlementsInput,
                                UpdateChildEntitlementsPayload,
                                create_child_license, get_license_hierarchy,
                                propagate_parent_entitlements,
                                revoke_child_license, transfer_child_license,
                                update_child_entitlements)
from .policy import (CreatePolicyInput, CreatePolicyPayload,
                     DeletePolicyPayload, DuplicatePolicyPayload,
                     TogglePolicyEnabledPayload, UpdatePolicyInput,
                     UpdatePolicyPayload, create_policy, delete_policy,
                     duplicate_policy, toggle_policy_enabled, update_policy)
from .policy_document import (AnalyzePolicyDocumentPayload,
                              DeletePolicyDocumentPayload, ExtractedPromptType,
                              PolicyDocumentType, RetryPolicyDocumentPayload,
                              UploadPolicyDocumentPayload,
                              analyze_policy_document, delete_policy_document,
                              retry_policy_document, upload_policy_document)
from .prompts import (CreateSystemPromptInput, DeletePromptPayload,
                      RatePromptPayload, SystemPromptPayload,
                      TogglePromptFavoritePayload, UpdateSystemPromptInput,
                      create_system_prompt, delete_system_prompt,
                      fork_system_prompt, rate_system_prompt,
                      toggle_prompt_favorite, update_system_prompt)
from .retention import (CreateLegalHoldInput, CreateLegalHoldPayload,
                        CreateRetentionPolicyInput,
                        CreateRetentionPolicyPayload, DeleteLegalHoldPayload,
                        DeleteRetentionPolicyPayload, ReleaseLegalHoldPayload,
                        ToggleRetentionPolicyEnabledPayload,
                        UpdateLegalHoldInput, UpdateLegalHoldPayload,
                        UpdateRetentionPolicyInput,
                        UpdateRetentionPolicyPayload, create_legal_hold,
                        create_retention_policy, delete_legal_hold,
                        delete_retention_policy, release_legal_hold,
                        toggle_retention_policy_enabled, update_legal_hold,
                        update_retention_policy)
from .risk import (AcknowledgeIncidentPayload, AssignIncidentPayload,
                   CloseIncidentPayload, CreateIncidentInput,
                   CreateIncidentPayload, CreateRiskInput, CreateRiskPayload,
                   DeleteRiskPayload, ResolveIncidentPayload,
                   ReviewRiskPayload, UpdateIncidentInput,
                   UpdateIncidentPayload, UpdateRiskInput, UpdateRiskPayload,
                   acknowledge_incident, assign_incident, close_incident,
                   create_incident, create_risk, delete_risk, resolve_incident,
                   review_risk, update_incident, update_risk)


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
    from zentinelle.models.tenant_config import TenantConfig
    from zentinelle.schema.auth_helpers import require_request_tenant_id
    tenant_id = require_request_tenant_id(info.context.request.user)

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
    from django.utils import timezone

    from zentinelle.models.notification import Notification
    from zentinelle.schema.auth_helpers import get_request_tenant_id
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
    from django.utils import timezone

    from zentinelle.models.notification import Notification
    from zentinelle.schema.auth_helpers import get_request_tenant_id
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


__all__ = [
    'AcknowledgeComplianceAlertPayload',
    'AcknowledgeIncidentPayload',
    'ActivateAgentEndpointPayload',
    'ActivateCompliancePackPayload',
    'AnalyzePolicyDocumentPayload',
    'AssignAgentToGroupPayload',
    'AssignIncidentPayload',
    'CloseIncidentPayload',
    'ComplianceFrameworkOutput',
    'CompliancePackMetaType',
    'CreateAgentEndpointInput',
    'CreateAgentEndpointPayload',
    'CreateAgentGroupPayload',
    'CreateChildLicenseInput',
    'CreateChildLicensePayload',
    'CreateContentRuleInput',
    'CreateContentRulePayload',
    'CreateIncidentInput',
    'CreateIncidentPayload',
    'CreateLegalHoldInput',
    'CreateLegalHoldPayload',
    'CreatePlatformAPIKeyPayload',
    'CreatePolicyInput',
    'CreatePolicyPayload',
    'CreateRetentionPolicyInput',
    'CreateRetentionPolicyPayload',
    'CreateRiskInput',
    'CreateRiskPayload',
    'CreateSystemPromptInput',
    'DeleteAPIKeyPayload',
    'DeleteAgentEndpointPayload',
    'DeleteAgentGroupPayload',
    'DeleteContentRulePayload',
    'DeleteLegalHoldPayload',
    'DeletePolicyDocumentPayload',
    'DeletePolicyPayload',
    'DeletePromptPayload',
    'DeleteRetentionPolicyPayload',
    'DeleteRiskPayload',
    'DismissComplianceAlertPayload',
    'DuplicateContentRulePayload',
    'DuplicatePolicyPayload',
    'ExportAuditLogsPayload',
    'ExtractedPromptType',
    'GenerateComplianceReportPayload',
    'GetLicenseHierarchyPayload',
    'LicenseHierarchyType',
    'LicenseType',
    'ListCompliancePacksPayload',
    'MarkAllNotificationsReadPayload',
    'OrganizationSettingsInput',
    'PolicyDocumentType',
    'PropagateParentEntitlementsPayload',
    'RatePromptPayload',
    'RegenerateEndpointApiKeyPayload',
    'ReleaseLegalHoldPayload',
    'ResolveComplianceAlertPayload',
    'ResolveIncidentPayload',
    'RetryPolicyDocumentPayload',
    'ReviewRiskPayload',
    'RevokeAPIKeyPayload',
    'RevokeChildLicensePayload',
    'RunComplianceCheckPayload',
    'SuspendAgentEndpointPayload',
    'SystemPromptPayload',
    'TestContentRulePayload',
    'ToggleContentRuleEnabledPayload',
    'ToggleFrameworkPayload',
    'TogglePolicyEnabledPayload',
    'TogglePromptFavoritePayload',
    'ToggleRetentionPolicyEnabledPayload',
    'TransferChildLicenseInput',
    'TransferChildLicensePayload',
    'UpdateAgentEndpointInput',
    'UpdateAgentEndpointPayload',
    'UpdateAgentGroupPayload',
    'UpdateChildEntitlementsInput',
    'UpdateChildEntitlementsPayload',
    'UpdateContentRuleInput',
    'UpdateContentRulePayload',
    'UpdateEndpointStatusPayload',
    'UpdateIncidentInput',
    'UpdateIncidentPayload',
    'UpdateLegalHoldInput',
    'UpdateLegalHoldPayload',
    'UpdateNotificationPayload',
    'UpdatePolicyInput',
    'UpdatePolicyPayload',
    'UpdateRetentionPolicyInput',
    'UpdateRetentionPolicyPayload',
    'UpdateRiskInput',
    'UpdateRiskPayload',
    'UpdateSystemPromptInput',
    'UploadPolicyDocumentPayload',
    'acknowledge_compliance_alert',
    'acknowledge_incident',
    'activate_agent_endpoint',
    'activate_compliance_pack',
    'analyze_policy_document',
    'assign_agent_to_group',
    'assign_incident',
    'close_incident',
    'create_agent_endpoint',
    'create_agent_group',
    'create_child_license',
    'create_content_rule',
    'create_incident',
    'create_legal_hold',
    'create_platform_api_key',
    'create_policy',
    'create_retention_policy',
    'create_risk',
    'create_system_prompt',
    'delete_agent_endpoint',
    'delete_agent_group',
    'delete_api_key',
    'delete_content_rule',
    'delete_legal_hold',
    'delete_policy',
    'delete_policy_document',
    'delete_retention_policy',
    'delete_risk',
    'delete_system_prompt',
    'disconnect_client_cove',
    'dismiss_compliance_alert',
    'duplicate_content_rule',
    'duplicate_policy',
    'export_audit_logs',
    'fork_system_prompt',
    'generate_compliance_report',
    'get_license_hierarchy',
    'list_compliance_packs',
    'mark_all_notifications_read',
    'propagate_parent_entitlements',
    'rate_system_prompt',
    'regenerate_endpoint_api_key',
    'release_legal_hold',
    'resolve_compliance_alert',
    'resolve_incident',
    'retry_policy_document',
    'review_risk',
    'revoke_api_key',
    'revoke_child_license',
    'run_compliance_check',
    'save_client_cove_config',
    'suspend_agent_endpoint',
    'test_client_cove_connection',
    'test_content_rule',
    'test_webhook',
    'toggle_content_rule_enabled',
    'toggle_framework',
    'toggle_policy_enabled',
    'toggle_prompt_favorite',
    'toggle_retention_policy_enabled',
    'transfer_child_license',
    'update_agent_endpoint',
    'update_agent_group',
    'update_child_entitlements',
    'update_content_rule',
    'update_endpoint_status',
    'update_incident',
    'update_legal_hold',
    'update_notification',
    'update_organization_settings',
    'update_policy',
    'update_retention_policy',
    'update_risk',
    'update_system_prompt',
    'upload_policy_document',
]
