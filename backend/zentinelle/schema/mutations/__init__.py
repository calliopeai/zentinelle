"""
Zentinelle GraphQL Mutations.

Note: Deployment-related mutations (CreateDeployment, JunoHubConfig, TerraformProvision, etc.)
are now in deployments.schema.mutations and registered via DeploymentsMutation in config/schema.py.
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


class Mutation(graphene.ObjectType):
    """Zentinelle GraphQL mutations.

    Note: Deployment-related mutations (CreateDeployment, JunoHubConfig, TerraformProvision, etc.)
    are now in deployments.schema.mutations and registered via DeploymentsMutation in config/schema.py.
    """

    # Endpoints
    create_agent_endpoint = CreateAgentEndpoint.Field()
    update_agent_endpoint = UpdateAgentEndpoint.Field()
    delete_agent_endpoint = DeleteAgentEndpoint.Field()
    suspend_agent_endpoint = SuspendAgentEndpoint.Field()
    activate_agent_endpoint = ActivateAgentEndpoint.Field()
    regenerate_endpoint_api_key = RegenerateEndpointApiKey.Field()
    update_endpoint_status = UpdateEndpointStatus.Field()

    # Policies
    create_policy = CreatePolicy.Field()
    update_policy = UpdatePolicy.Field()
    delete_policy = DeletePolicy.Field()
    duplicate_policy = DuplicatePolicy.Field()
    toggle_policy_enabled = TogglePolicyEnabled.Field()

    # Compliance
    run_compliance_check = RunComplianceCheck.Field()
    toggle_framework = ToggleFramework.Field()

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
