"""
GraphQL schema for Zentinelle standalone.

Composes the full Strawberry schema from queries, mutations, and the prompt library.
"""
import strawberry

from .queries import Query as ZentinelleQuery
from .system_prompt import PromptLibraryQuery
from . import mutations as m
from .system_prompt import (
    create_system_prompt as sp_create,
    update_system_prompt as sp_update,
    delete_system_prompt as sp_delete,
    fork_system_prompt as sp_fork,
    toggle_prompt_favorite as sp_toggle_fav,
    rate_system_prompt as sp_rate,
    test_system_prompt as sp_test,
    analyze_system_prompt as sp_analyze,
    CreateSystemPromptInput as SPCreateInput,
    UpdateSystemPromptInput as SPUpdateInput,
    CreateSystemPromptPayload,
    UpdateSystemPromptPayload,
    DeleteSystemPromptPayload,
    ForkSystemPromptPayload,
    TogglePromptFavoritePayload,
    RateSystemPromptPayload,
    TestSystemPromptPayload,
    AnalyzeSystemPromptPayload,
)


@strawberry.type
class Query(ZentinelleQuery, PromptLibraryQuery):
    pass


@strawberry.type
class Mutation:

    # Endpoints
    @strawberry.mutation
    def create_agent_endpoint(self, info: strawberry.types.Info, input: m.CreateAgentEndpointInput) -> m.CreateAgentEndpointPayload:
        return m.create_agent_endpoint(info, input)

    @strawberry.mutation
    def update_agent_endpoint(self, info: strawberry.types.Info, input: m.UpdateAgentEndpointInput) -> m.UpdateAgentEndpointPayload:
        return m.update_agent_endpoint(info, input)

    @strawberry.mutation
    def delete_agent_endpoint(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteAgentEndpointPayload:
        return m.delete_agent_endpoint(info, id)

    @strawberry.mutation
    def suspend_agent_endpoint(self, info: strawberry.types.Info, id: strawberry.ID) -> m.SuspendAgentEndpointPayload:
        return m.suspend_agent_endpoint(info, id)

    @strawberry.mutation
    def activate_agent_endpoint(self, info: strawberry.types.Info, id: strawberry.ID) -> m.ActivateAgentEndpointPayload:
        return m.activate_agent_endpoint(info, id)

    @strawberry.mutation
    def regenerate_endpoint_api_key(self, info: strawberry.types.Info, id: strawberry.ID) -> m.RegenerateEndpointApiKeyPayload:
        return m.regenerate_endpoint_api_key(info, id)

    @strawberry.mutation
    def update_endpoint_status(self, info: strawberry.types.Info, id: strawberry.ID, status: str) -> m.UpdateEndpointStatusPayload:
        return m.update_endpoint_status(info, id, status)

    # Agent Groups
    @strawberry.mutation
    def create_agent_group(self, info: strawberry.types.Info, name: str, description: str = "", tier: str = "standard", color: str = "#6366f1") -> m.CreateAgentGroupPayload:
        return m.create_agent_group(info, name, description, tier, color)

    @strawberry.mutation
    def update_agent_group(self, info: strawberry.types.Info, id: strawberry.ID, name: str = None, description: str = None, tier: str = None, color: str = None) -> m.UpdateAgentGroupPayload:
        return m.update_agent_group(info, id, name, description, tier, color)

    @strawberry.mutation
    def delete_agent_group(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteAgentGroupPayload:
        return m.delete_agent_group(info, id)

    @strawberry.mutation
    def assign_agent_to_group(self, info: strawberry.types.Info, agent_id: strawberry.ID, group_id: strawberry.ID) -> m.AssignAgentToGroupPayload:
        return m.assign_agent_to_group(info, agent_id, group_id)

    # Policies
    @strawberry.mutation
    def create_policy(self, info: strawberry.types.Info, input: m.CreatePolicyInput) -> m.CreatePolicyPayload:
        return m.create_policy(info, input)

    @strawberry.mutation
    def update_policy(self, info: strawberry.types.Info, input: m.UpdatePolicyInput) -> m.UpdatePolicyPayload:
        return m.update_policy(info, input)

    @strawberry.mutation
    def delete_policy(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeletePolicyPayload:
        return m.delete_policy(info, id)

    @strawberry.mutation
    def duplicate_policy(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DuplicatePolicyPayload:
        return m.duplicate_policy(info, id)

    @strawberry.mutation
    def toggle_policy_enabled(self, info: strawberry.types.Info, id: strawberry.ID) -> m.TogglePolicyEnabledPayload:
        return m.toggle_policy_enabled(info, id)

    # Compliance
    @strawberry.mutation
    def run_compliance_check(self, info: strawberry.types.Info) -> m.RunComplianceCheckPayload:
        return m.run_compliance_check(info)

    @strawberry.mutation
    def toggle_framework(self, info: strawberry.types.Info, framework_id: str) -> m.ToggleFrameworkPayload:
        return m.toggle_framework(info, framework_id)

    @strawberry.mutation
    def generate_compliance_report(self, info: strawberry.types.Info, framework_id: str = None) -> m.GenerateComplianceReportPayload:
        return m.generate_compliance_report(info, framework_id)

    # Compliance Alerts
    @strawberry.mutation
    def acknowledge_compliance_alert(self, info: strawberry.types.Info, id: strawberry.ID) -> m.AcknowledgeComplianceAlertPayload:
        return m.acknowledge_compliance_alert(info, id)

    @strawberry.mutation
    def resolve_compliance_alert(self, info: strawberry.types.Info, id: strawberry.ID, notes: str = None) -> m.ResolveComplianceAlertPayload:
        return m.resolve_compliance_alert(info, id, notes)

    @strawberry.mutation
    def dismiss_compliance_alert(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DismissComplianceAlertPayload:
        return m.dismiss_compliance_alert(info, id)

    # Risks
    @strawberry.mutation
    def create_risk(self, info: strawberry.types.Info, input: m.CreateRiskInput) -> m.CreateRiskPayload:
        return m.create_risk(info, input)

    @strawberry.mutation
    def update_risk(self, info: strawberry.types.Info, id: strawberry.ID, input: m.UpdateRiskInput) -> m.UpdateRiskPayload:
        return m.update_risk(info, id, input)

    @strawberry.mutation
    def delete_risk(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteRiskPayload:
        return m.delete_risk(info, id)

    @strawberry.mutation
    def review_risk(self, info: strawberry.types.Info, id: strawberry.ID) -> m.ReviewRiskPayload:
        return m.review_risk(info, id)

    # Incidents
    @strawberry.mutation
    def create_incident(self, info: strawberry.types.Info, input: m.CreateIncidentInput) -> m.CreateIncidentPayload:
        return m.create_incident(info, input)

    @strawberry.mutation
    def update_incident(self, info: strawberry.types.Info, id: strawberry.ID, input: m.UpdateIncidentInput) -> m.UpdateIncidentPayload:
        return m.update_incident(info, id, input)

    @strawberry.mutation
    def acknowledge_incident(self, info: strawberry.types.Info, id: strawberry.ID) -> m.AcknowledgeIncidentPayload:
        return m.acknowledge_incident(info, id)

    @strawberry.mutation
    def resolve_incident(self, info: strawberry.types.Info, id: strawberry.ID, resolution: str = None) -> m.ResolveIncidentPayload:
        return m.resolve_incident(info, id, resolution)

    @strawberry.mutation
    def close_incident(self, info: strawberry.types.Info, id: strawberry.ID, lessons_learned: str = None) -> m.CloseIncidentPayload:
        return m.close_incident(info, id, lessons_learned)

    @strawberry.mutation
    def assign_incident(self, info: strawberry.types.Info, id: strawberry.ID, assignee_id: str = None) -> m.AssignIncidentPayload:
        return m.assign_incident(info, id, assignee_id)

    # Retention
    @strawberry.mutation
    def create_retention_policy(self, info: strawberry.types.Info, input: m.CreateRetentionPolicyInput) -> m.CreateRetentionPolicyPayload:
        return m.create_retention_policy(info, input)

    @strawberry.mutation
    def update_retention_policy(self, info: strawberry.types.Info, input: m.UpdateRetentionPolicyInput) -> m.UpdateRetentionPolicyPayload:
        return m.update_retention_policy(info, input)

    @strawberry.mutation
    def delete_retention_policy(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteRetentionPolicyPayload:
        return m.delete_retention_policy(info, id)

    @strawberry.mutation
    def toggle_retention_policy_enabled(self, info: strawberry.types.Info, id: strawberry.ID) -> m.ToggleRetentionPolicyEnabledPayload:
        return m.toggle_retention_policy_enabled(info, id)

    # Legal Holds
    @strawberry.mutation
    def create_legal_hold(self, info: strawberry.types.Info, input: m.CreateLegalHoldInput) -> m.CreateLegalHoldPayload:
        return m.create_legal_hold(info, input)

    @strawberry.mutation
    def update_legal_hold(self, info: strawberry.types.Info, input: m.UpdateLegalHoldInput) -> m.UpdateLegalHoldPayload:
        return m.update_legal_hold(info, input)

    @strawberry.mutation
    def release_legal_hold(self, info: strawberry.types.Info, id: strawberry.ID) -> m.ReleaseLegalHoldPayload:
        return m.release_legal_hold(info, id)

    @strawberry.mutation
    def delete_legal_hold(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteLegalHoldPayload:
        return m.delete_legal_hold(info, id)

    # Content Rules
    @strawberry.mutation
    def create_content_rule(self, info: strawberry.types.Info, input: m.CreateContentRuleInput) -> m.CreateContentRulePayload:
        return m.create_content_rule(info, input)

    @strawberry.mutation
    def update_content_rule(self, info: strawberry.types.Info, id: strawberry.ID, input: m.UpdateContentRuleInput) -> m.UpdateContentRulePayload:
        return m.update_content_rule(info, id, input)

    @strawberry.mutation
    def delete_content_rule(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteContentRulePayload:
        return m.delete_content_rule(info, id)

    @strawberry.mutation
    def toggle_content_rule_enabled(self, info: strawberry.types.Info, id: strawberry.ID) -> m.ToggleContentRuleEnabledPayload:
        return m.toggle_content_rule_enabled(info, id)

    @strawberry.mutation
    def duplicate_content_rule(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DuplicateContentRulePayload:
        return m.duplicate_content_rule(info, id)

    @strawberry.mutation
    def test_content_rule(self, info: strawberry.types.Info, id: strawberry.ID, content: str) -> m.TestContentRulePayload:
        return m.test_content_rule(info, id, content)

    # Platform API Keys
    @strawberry.mutation
    def create_platform_api_key(self, info: strawberry.types.Info, name: str, scopes: list[str] = None) -> m.CreatePlatformAPIKeyPayload:
        return m.create_platform_api_key(info, name, scopes)

    @strawberry.mutation
    def revoke_api_key(self, info: strawberry.types.Info, id: strawberry.ID) -> m.RevokeAPIKeyPayload:
        return m.revoke_api_key(info, id)

    @strawberry.mutation
    def delete_api_key(self, info: strawberry.types.Info, id: strawberry.ID) -> m.DeleteAPIKeyPayload:
        return m.delete_api_key(info, id)

    # Compliance Packs
    @strawberry.mutation
    def activate_compliance_pack(self, info: strawberry.types.Info, pack_id: str) -> m.ActivateCompliancePackPayload:
        return m.activate_compliance_pack(info, pack_id)

    @strawberry.mutation
    def list_compliance_packs(self, info: strawberry.types.Info) -> m.ListCompliancePacksPayload:
        return m.list_compliance_packs(info)

    # System Prompts
    @strawberry.mutation
    def create_system_prompt(self, info: strawberry.types.Info, input: SPCreateInput) -> CreateSystemPromptPayload:
        return sp_create(info, input)

    @strawberry.mutation
    def update_system_prompt(self, info: strawberry.types.Info, id: strawberry.ID, input: SPUpdateInput) -> UpdateSystemPromptPayload:
        return sp_update(info, id, input)

    @strawberry.mutation
    def delete_system_prompt(self, info: strawberry.types.Info, id: strawberry.ID) -> DeleteSystemPromptPayload:
        return sp_delete(info, id)

    @strawberry.mutation
    def fork_system_prompt(self, info: strawberry.types.Info, id: strawberry.ID) -> ForkSystemPromptPayload:
        return sp_fork(info, id)

    @strawberry.mutation
    def toggle_prompt_favorite(self, info: strawberry.types.Info, prompt_id: strawberry.ID) -> TogglePromptFavoritePayload:
        return sp_toggle_fav(info, prompt_id)

    @strawberry.mutation
    def rate_system_prompt(self, info: strawberry.types.Info, prompt_id: strawberry.ID, rating: int, review: str = None) -> RateSystemPromptPayload:
        return sp_rate(info, prompt_id, rating, review)

    @strawberry.mutation
    def test_system_prompt(self, info: strawberry.types.Info, system_prompt: str, user_message: str) -> TestSystemPromptPayload:
        return sp_test(info, system_prompt, user_message)

    @strawberry.mutation
    def analyze_system_prompt(self, info: strawberry.types.Info, prompt_text: str, prompt_type: str = "system", target_providers: list[str] = None) -> AnalyzeSystemPromptPayload:
        return sp_analyze(info, prompt_text, prompt_type, target_providers)

    # Organization Settings
    @strawberry.mutation
    def update_organization_settings(self, info: strawberry.types.Info, settings: m.OrganizationSettingsInput) -> m.UpdateOrganizationSettingsPayload:
        return m.update_organization_settings(info, settings)

    # Notifications
    @strawberry.mutation
    def update_notification(self, info: strawberry.types.Info, id: strawberry.ID, status: str) -> m.UpdateNotificationPayload:
        return m.update_notification(info, id, status)

    @strawberry.mutation
    def mark_all_notifications_read(self, info: strawberry.types.Info) -> m.MarkAllNotificationsReadPayload:
        return m.mark_all_notifications_read(info)

    # Audit Logs
    @strawberry.mutation
    def export_audit_logs(self, info: strawberry.types.Info, format: str, start_date: str, end_date: str) -> m.ExportAuditLogsPayload:
        from datetime import datetime as dt
        return m.export_audit_logs(info, format, dt.fromisoformat(start_date), dt.fromisoformat(end_date))


schema = strawberry.Schema(query=Query, mutation=Mutation)
