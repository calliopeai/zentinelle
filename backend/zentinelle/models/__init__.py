"""
Zentinelle Models - Agent-level GRC (Governance, Risk, Compliance).

This module contains models for:
- AgentEndpoint: Registered AI agents
- Policy: Agent policies and constraints
- Event: Agent events and audit trail
- Compliance: Content rules, scanning, violations
- Usage: Usage metrics and billing reconciliation

Deployment-level models (Deployment, JunoHubConfig, TerraformProvision, AI Keys)
are in the `deployments` app.
"""

# Agent-level models
from zentinelle.models.endpoint import AgentEndpoint
from zentinelle.models.policy import Policy, PolicyRevision, PolicyHistory
from zentinelle.models.event import Event
from zentinelle.models.audit import AuditLog
from zentinelle.models.policy_document import PolicyDocument

# Compliance & Monitoring
from zentinelle.models.compliance import (
    ContentRule,
    ContentScan,
    ContentViolation,
    ComplianceAlert,
    InteractionLog,
    UsageSummary,
    ComplianceAssessment,
    ComplianceFrameworkConfig,
)

# Usage tracking (agent-level)
from zentinelle.models.usage import (
    UsageMetric,
    UsageAggregate,
    Subscription,
    License,
    LicensedUser,
    LicensedTool,
    MonthlyUserCount,
    # License Compliance
    LicenseComplianceReport,
    LicenseComplianceViolation,
)

# Risk Management
from zentinelle.models.risk import Risk, Incident, IncidentComment, NotificationConfig

# Retention Policies
from zentinelle.models.retention_policy import RetentionPolicy, LegalHold, DataArchive

# AI Provider Registry (shared)
from zentinelle.models.ai_provider import AIProvider, load_provider_fixtures

# Model Registry (shared)
from zentinelle.models.model_registry import (
    AIModel,
    OrganizationModelApproval,
    ModelUsageLog,
    load_model_fixtures,
)

# Platform API Keys (shared)
from zentinelle.models.api_key import APIKey

# System Prompt Library
from zentinelle.models.system_prompt import (
    PromptCategory,
    PromptTag,
    SystemPrompt,
    PromptFavorite,
    PromptRating,
)

# Zentinelle License & Agent Entitlements
from zentinelle.models.license import ZentinelleLicense, AgentEntitlement

# Compliance Report Export
from zentinelle.models.reporting import Report

# Notifications
from zentinelle.models.notification import Notification, create_notification

# Tenant configuration (org settings persistence)
from zentinelle.models.tenant_config import TenantConfig

# Agent Groups
from zentinelle.models.agent_group import AgentGroup

# Client Cove Integration
from zentinelle.models.integration import ClientCoveIntegration

__all__ = [
    # Agent-level
    'AgentEndpoint',
    'Policy',
    'PolicyRevision',
    'PolicyHistory',
    'PolicyDocument',
    'Event',
    'AuditLog',
    # Compliance & Monitoring
    'ContentRule',
    'ContentScan',
    'ContentViolation',
    'ComplianceAlert',
    'InteractionLog',
    'UsageSummary',
    'ComplianceAssessment',
    'ComplianceFrameworkConfig',
    # Usage
    'UsageMetric',
    'UsageAggregate',
    'Subscription',
    'License',
    'LicensedUser',
    'LicensedTool',
    'MonthlyUserCount',
    # License Compliance
    'LicenseComplianceReport',
    'LicenseComplianceViolation',
    # Risk
    'Risk',
    'Incident',
    'IncidentComment',
    'NotificationConfig',
    # Retention
    'RetentionPolicy',
    'LegalHold',
    'DataArchive',
    # AI Provider Registry
    'AIProvider',
    'load_provider_fixtures',
    # Model Registry
    'AIModel',
    'OrganizationModelApproval',
    'ModelUsageLog',
    'load_model_fixtures',
    # Platform API Keys
    'APIKey',
    # System Prompt Library
    'PromptCategory',
    'PromptTag',
    'SystemPrompt',
    'PromptFavorite',
    'PromptRating',
    # Zentinelle License & Agent Entitlements
    'ZentinelleLicense',
    'AgentEntitlement',
    # Compliance Report Export
    'Report',
    # Notifications
    'Notification',
    'create_notification',
    # Tenant Config
    'TenantConfig',
    # Agent Groups
    'AgentGroup',
    # Client Cove Integration
    'ClientCoveIntegration',
]
