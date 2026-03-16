"""
Zentinelle GraphQL Mutations.

Standalone version — deployment-related mutations (ai_keys, deployment,
deployment_ops, junohub) are excluded as they depend on external apps.
"""
import graphene

from .endpoint import (
    CreateAgentEndpoint,
    UpdateAgentEndpoint,
    DeleteAgentEndpoint,
    SuspendAgentEndpoint,
    ActivateAgentEndpoint,
    RegenerateEndpointApiKey,
    UpdateEndpointStatus,
)
from .policy import (
    CreatePolicy,
    UpdatePolicy,
    DeletePolicy,
    DuplicatePolicy,
    TogglePolicyEnabled,
)
from .compliance import (
    RunComplianceCheck,
    ToggleFramework,
    GenerateComplianceReport,
)
from .compliance_alerts import (
    AcknowledgeComplianceAlert,
    ResolveComplianceAlert,
    DismissComplianceAlert,
)
from .policy_document import (
    UploadPolicyDocument,
    AnalyzePolicyDocument,
    DeletePolicyDocument,
    RetryPolicyDocument,
)
from .risk import (
    CreateRisk,
    UpdateRisk,
    DeleteRisk,
    ReviewRisk,
    CreateIncident,
    UpdateIncident,
    AcknowledgeIncident,
    ResolveIncident,
    CloseIncident,
    AssignIncident,
)
from .retention import (
    CreateRetentionPolicy,
    UpdateRetentionPolicy,
    DeleteRetentionPolicy,
    ToggleRetentionPolicyEnabled,
    CreateLegalHold,
    UpdateLegalHold,
    ReleaseLegalHold,
    DeleteLegalHold,
)
from .content_rules import (
    CreateContentRule,
    UpdateContentRule,
    DeleteContentRule,
    ToggleContentRuleEnabled,
    DuplicateContentRule,
    TestContentRule,
)
from .license_hierarchy import (
    CreateChildLicense,
    UpdateChildEntitlements,
    TransferChildLicense,
    RevokeChildLicense,
    PropagateParentEntitlements,
    GetLicenseHierarchy,
)
from .api_keys_platform import (
    CreatePlatformAPIKey,
    RevokeAPIKey,
    DeleteAPIKey,
)
from .prompts import (
    CreateSystemPrompt,
    UpdateSystemPrompt,
    DeleteSystemPrompt,
    ForkSystemPrompt,
    TogglePromptFavorite,
    RateSystemPrompt,
)
from .integration import (
    TestClientCoveConnection,
    SaveClientCoveConfig,
    DisconnectClientCove,
    TestWebhook,
)
from .compliance_packs import (
    ActivateCompliancePack,
    ListCompliancePacks,
)
from .agent_groups import (
    CreateAgentGroup,
    UpdateAgentGroup,
    DeleteAgentGroup,
    AssignAgentToGroup,
)

from zentinelle.schema.types import (
    OrganizationType,
    UpdateOrganizationSettingsPayload,
    NotificationType,
)


class OrganizationSettingsInput(graphene.InputObjectType):
    name = graphene.String()
    contact_email = graphene.String()
    timezone = graphene.String()
    email_notifications = graphene.Boolean()
    slack_notifications = graphene.Boolean()
    webhook_url = graphene.String()
    default_policy_mode = graphene.String()
    audit_logging = graphene.Boolean()


class UpdateOrganizationSettings(graphene.Mutation):
    """Persist org settings to TenantConfig for the current tenant."""
    class Arguments:
        settings = OrganizationSettingsInput(required=True)

    Output = UpdateOrganizationSettingsPayload

    @staticmethod
    def mutate(root, info, settings):
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        from zentinelle.models.tenant_config import TenantConfig
        tenant_id = get_request_tenant_id(info.context.user) or "default"

        settings_dict = dict(settings) if settings else {}
        name = settings_dict.pop('name', None)

        config, _ = TenantConfig.objects.get_or_create(tenant_id=tenant_id)
        if name is not None:
            config.name = name or "My Organization"
        # Merge remaining settings keys (notifications, webhook, etc.)
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


class UpdateNotificationInput(graphene.InputObjectType):
    id = graphene.ID(required=True)
    status = graphene.String(required=True)


class UpdateNotificationPayload(graphene.ObjectType):
    notification = graphene.Field(NotificationType)
    errors = graphene.List(graphene.String)


class UpdateNotification(graphene.Mutation):
    class Arguments:
        input = UpdateNotificationInput(required=True)

    Output = UpdateNotificationPayload

    @staticmethod
    def mutate(root, info, input):
        from zentinelle.models.notification import Notification
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        from django.utils import timezone
        tenant_id = get_request_tenant_id(info.context.user)
        try:
            n = Notification.objects.get(id=input.id, tenant_id=tenant_id)
            n.status = input.status
            n.status_date = timezone.now()
            n.save(update_fields=['status', 'status_date'])
            return UpdateNotificationPayload(notification=n, errors=[])
        except Notification.DoesNotExist:
            return UpdateNotificationPayload(notification=None, errors=["Notification not found."])


class MarkAllNotificationsReadPayload(graphene.ObjectType):
    success = graphene.Boolean()
    count = graphene.Int()


class MarkAllNotificationsRead(graphene.Mutation):
    Output = MarkAllNotificationsReadPayload

    @staticmethod
    def mutate(root, info):
        from zentinelle.models.notification import Notification
        from zentinelle.schema.auth_helpers import get_request_tenant_id
        from django.utils import timezone
        tenant_id = get_request_tenant_id(info.context.user)
        count = Notification.objects.filter(
            tenant_id=tenant_id,
            status=Notification.Status.UNREAD,
        ).update(status=Notification.Status.READ, status_date=timezone.now())
        return MarkAllNotificationsReadPayload(success=True, count=count)


class Mutation(graphene.ObjectType):
    """Zentinelle GraphQL mutations (standalone)."""

    # Endpoints
    create_agent_endpoint = CreateAgentEndpoint.Field()
    update_agent_endpoint = UpdateAgentEndpoint.Field()
    delete_agent_endpoint = DeleteAgentEndpoint.Field()
    suspend_agent_endpoint = SuspendAgentEndpoint.Field()
    activate_agent_endpoint = ActivateAgentEndpoint.Field()
    regenerate_endpoint_api_key = RegenerateEndpointApiKey.Field()
    update_endpoint_status = UpdateEndpointStatus.Field()

    # Agent Groups
    create_agent_group = CreateAgentGroup.Field()
    update_agent_group = UpdateAgentGroup.Field()
    delete_agent_group = DeleteAgentGroup.Field()
    assign_agent_to_group = AssignAgentToGroup.Field()

    # Policies
    create_policy = CreatePolicy.Field()
    update_policy = UpdatePolicy.Field()
    delete_policy = DeletePolicy.Field()
    duplicate_policy = DuplicatePolicy.Field()
    toggle_policy_enabled = TogglePolicyEnabled.Field()

    # Compliance
    run_compliance_check = RunComplianceCheck.Field()
    toggle_framework = ToggleFramework.Field()
    generate_compliance_report = GenerateComplianceReport.Field()

    # Compliance Alerts
    acknowledge_compliance_alert = AcknowledgeComplianceAlert.Field()
    resolve_compliance_alert = ResolveComplianceAlert.Field()
    dismiss_compliance_alert = DismissComplianceAlert.Field()

    # Policy Documents
    upload_policy_document = UploadPolicyDocument.Field()
    analyze_policy_document = AnalyzePolicyDocument.Field()
    delete_policy_document = DeletePolicyDocument.Field()
    retry_policy_document = RetryPolicyDocument.Field()

    # Risks
    create_risk = CreateRisk.Field()
    update_risk = UpdateRisk.Field()
    delete_risk = DeleteRisk.Field()
    review_risk = ReviewRisk.Field()

    # Incidents
    create_incident = CreateIncident.Field()
    update_incident = UpdateIncident.Field()
    acknowledge_incident = AcknowledgeIncident.Field()
    resolve_incident = ResolveIncident.Field()
    close_incident = CloseIncident.Field()
    assign_incident = AssignIncident.Field()

    # Retention Policies
    create_retention_policy = CreateRetentionPolicy.Field()
    update_retention_policy = UpdateRetentionPolicy.Field()
    delete_retention_policy = DeleteRetentionPolicy.Field()
    toggle_retention_policy_enabled = ToggleRetentionPolicyEnabled.Field()

    # Legal Holds
    create_legal_hold = CreateLegalHold.Field()
    update_legal_hold = UpdateLegalHold.Field()
    release_legal_hold = ReleaseLegalHold.Field()
    delete_legal_hold = DeleteLegalHold.Field()

    # Content Rules
    create_content_rule = CreateContentRule.Field()
    update_content_rule = UpdateContentRule.Field()
    delete_content_rule = DeleteContentRule.Field()
    toggle_content_rule_enabled = ToggleContentRuleEnabled.Field()
    duplicate_content_rule = DuplicateContentRule.Field()
    test_content_rule = TestContentRule.Field()

    # License Hierarchy (Enterprise)
    create_child_license = CreateChildLicense.Field()
    update_child_entitlements = UpdateChildEntitlements.Field()
    transfer_child_license = TransferChildLicense.Field()
    revoke_child_license = RevokeChildLicense.Field()
    propagate_parent_entitlements = PropagateParentEntitlements.Field()
    get_license_hierarchy = GetLicenseHierarchy.Field()

    # Platform API Keys
    create_platform_api_key = CreatePlatformAPIKey.Field()
    revoke_api_key = RevokeAPIKey.Field()
    delete_api_key = DeleteAPIKey.Field()

    # Compliance Packs
    activate_compliance_pack = ActivateCompliancePack.Field()
    list_compliance_packs = ListCompliancePacks.Field()

    # System Prompts
    create_system_prompt = CreateSystemPrompt.Field()
    update_system_prompt = UpdateSystemPrompt.Field()
    delete_system_prompt = DeleteSystemPrompt.Field()
    fork_system_prompt = ForkSystemPrompt.Field()
    toggle_prompt_favorite = TogglePromptFavorite.Field()
    rate_system_prompt = RateSystemPrompt.Field()

    # Organization Settings
    update_organization_settings = UpdateOrganizationSettings.Field()

    # Client Cove Integration
    test_client_cove_connection = TestClientCoveConnection.Field()
    save_client_cove_config = SaveClientCoveConfig.Field()
    disconnect_client_cove = DisconnectClientCove.Field()

    # Webhook
    test_webhook = TestWebhook.Field()

    # Notifications
    update_notification = UpdateNotification.Field()
    mark_all_notifications_read = MarkAllNotificationsRead.Field()


