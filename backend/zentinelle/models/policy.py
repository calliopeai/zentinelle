import uuid

from django.db import models
from zentinelle.models.base import Tracking


class Policy(Tracking):
    """
    A governance policy that can be scoped to org, deployment, endpoint, or user.
    Policies inherit: Organization → Deployment → Endpoint → User
    Higher priority policies override lower ones.
    """

    class ScopeType(models.TextChoices):
        ORGANIZATION = 'organization', 'Organization-wide'
        SUB_ORGANIZATION = 'sub_organization', 'Team/Division'
        DEPLOYMENT = 'deployment', 'Specific Deployment'
        ENDPOINT = 'endpoint', 'Specific Endpoint'
        USER = 'user', 'Specific User'

    class PolicyType(models.TextChoices):
        # Prompts & AI behavior
        SYSTEM_PROMPT = 'system_prompt', 'System Prompt'
        AI_GUARDRAIL = 'ai_guardrail', 'AI Guardrail'

        # LLM Controls
        MODEL_RESTRICTION = 'model_restriction', 'Model Restriction'
        CONTEXT_LIMIT = 'context_limit', 'Context Limit'
        OUTPUT_FILTER = 'output_filter', 'Output Filter'

        # Agent Controls
        AGENT_CAPABILITY = 'agent_capability', 'Agent Capability'
        AGENT_MEMORY = 'agent_memory', 'Agent Memory'
        HUMAN_OVERSIGHT = 'human_oversight', 'Human Oversight'

        # Resource controls
        RESOURCE_QUOTA = 'resource_quota', 'Resource Quota'
        BUDGET_LIMIT = 'budget_limit', 'Budget Limit'
        RATE_LIMIT = 'rate_limit', 'Rate Limit'

        # Security
        TOOL_PERMISSION = 'tool_permission', 'Tool Permission'
        NETWORK_POLICY = 'network_policy', 'Network Policy'
        SECRET_ACCESS = 'secret_access', 'Secret Access'
        DATA_ACCESS = 'data_access', 'Data Access'

        # Compliance
        AUDIT_POLICY = 'audit_policy', 'Audit Policy'
        SESSION_POLICY = 'session_policy', 'Session Policy'
        DATA_RETENTION = 'data_retention', 'Data Retention'

    class Enforcement(models.TextChoices):
        ENFORCE = 'enforce', 'Enforce'
        AUDIT = 'audit', 'Audit Only'
        DISABLED = 'disabled', 'Disabled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Scope - determines where this policy applies
    scope_type = models.CharField(
        max_length=20,
        choices=ScopeType.choices,
        default=ScopeType.ORGANIZATION
    )
    # The entity this policy is scoped to (null for org-wide)
    # TODO: decouple - scope_sub_organization FK removed
    scope_sub_organization_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External sub-organization ID reference'
    )
    # TODO: decouple - scope_deployment FK removed
    scope_deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )
    scope_endpoint = models.ForeignKey(
        'zentinelle.AgentEndpoint',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='policies'
    )
    # TODO: decouple - scope_user FK removed (use user_id field)
    scope_user_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External user ID for user-scoped policies'
    )

    # Policy definition
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    policy_type = models.CharField(
        max_length=50,
        choices=PolicyType.choices
    )

    # Policy configuration (schema depends on policy_type)
    config = models.JSONField(default=dict)

    # Behavior
    priority = models.IntegerField(
        default=0,
        help_text='Higher priority overrides lower. Default is 0.'
    )
    enabled = models.BooleanField(default=True)
    enforcement = models.CharField(
        max_length=20,
        choices=Enforcement.choices,
        default=Enforcement.ENFORCE
    )

    # Audit fields
    # TODO: decouple - created_by FK removed (use user_id field)
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    class Meta:
        verbose_name_plural = 'Policies'
        ordering = ['tenant_id', '-priority', 'name']
        indexes = [
            models.Index(fields=['tenant_id', 'policy_type', 'enabled']),
            models.Index(fields=['scope_type', 'enabled']),
            models.Index(fields=['tenant_id', 'scope_type', 'policy_type']),
        ]

    def __str__(self):
        return f"{self.name} ({self.policy_type})"

    def clean(self):
        """Validate scope fields match scope_type."""
        from django.core.exceptions import ValidationError

        if self.scope_type == self.ScopeType.ORGANIZATION:
            if self.scope_sub_organization_id_ext or self.scope_deployment_id_ext or self.scope_endpoint or self.scope_user_id_ext:
                raise ValidationError(
                    "Organization-scoped policies should not have sub_organization, deployment, endpoint, or user set."
                )
        elif self.scope_type == self.ScopeType.SUB_ORGANIZATION:
            if not self.scope_sub_organization_id_ext:
                raise ValidationError("Sub-organization-scoped policies must have a sub_organization set.")
            if self.scope_deployment_id_ext or self.scope_endpoint or self.scope_user_id_ext:
                raise ValidationError(
                    "Sub-organization-scoped policies should not have deployment, endpoint, or user set."
                )
        elif self.scope_type == self.ScopeType.DEPLOYMENT:
            if not self.scope_deployment_id_ext:
                raise ValidationError("Deployment-scoped policies must have a deployment set.")
            if self.scope_endpoint or self.scope_user_id_ext:
                raise ValidationError(
                    "Deployment-scoped policies should not have endpoint or user set."
                )
        elif self.scope_type == self.ScopeType.ENDPOINT:
            if not self.scope_endpoint:
                raise ValidationError("Endpoint-scoped policies must have an endpoint set.")
            if self.scope_user_id_ext:
                raise ValidationError("Endpoint-scoped policies should not have user set.")
        elif self.scope_type == self.ScopeType.USER:
            if not self.scope_user_id_ext:
                raise ValidationError("User-scoped policies must have a user set.")

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


# Policy config schemas for reference (validated at application level)
POLICY_CONFIG_SCHEMAS = {
    'system_prompt': {
        'prompt_text': str,
        'applies_to': list,  # ["chat", "lab", "all"]
        'append_mode': bool,  # True = append to default, False = replace
    },
    'ai_guardrail': {
        'blocked_topics': list,
        'pii_redaction': bool,
        'toxicity_threshold': float,
        'prompt_injection_detection': bool,
    },
    # LLM Controls
    'model_restriction': {
        'allowed_providers': list,  # ["openai", "anthropic", "google"]
        'allowed_models': list,  # ["gpt-4", "claude-3-opus", "gemini-pro"]
        'blocked_models': list,
        'max_model_tier': str,  # "basic", "standard", "premium"
    },
    'context_limit': {
        'max_input_tokens': int,
        'max_output_tokens': int,
        'max_total_tokens': int,
        'truncation_strategy': str,  # "head", "tail", "middle"
    },
    'output_filter': {
        'blocked_patterns': list,  # Regex patterns to block
        'required_format': str,  # "json", "markdown", "plain"
        'max_response_length': int,
        'filter_code_blocks': bool,
        'filter_urls': bool,
    },
    # Agent Controls
    'agent_capability': {
        'can_execute_code': bool,
        'can_access_filesystem': bool,
        'can_make_network_requests': bool,
        'can_spawn_subagents': bool,
        'max_execution_time_seconds': int,
        'allowed_languages': list,  # ["python", "javascript", "bash"]
    },
    'agent_memory': {
        'enable_long_term_memory': bool,
        'max_memory_items': int,
        'memory_retention_days': int,
        'clear_memory_on_session_end': bool,
    },
    'human_oversight': {
        'require_approval_for_actions': list,  # ["code_execution", "file_write", "network"]
        'auto_approve_threshold': float,  # Confidence threshold for auto-approval
        'escalation_email': str,
        'max_autonomous_actions': int,
    },
    'resource_quota': {
        'max_concurrent_servers': int,
        'max_server_hours_per_month': int,
        'allowed_instance_sizes': list,
        'allowed_services': list,
    },
    'budget_limit': {
        'monthly_budget_usd': float,
        'alert_threshold_percent': int,
        'hard_limit': bool,
    },
    'rate_limit': {
        'requests_per_minute': int,
        'requests_per_hour': int,
        'tokens_per_day': int,
    },
    'tool_permission': {
        'allowed_tools': list,
        'denied_tools': list,
        'requires_approval': list,
    },
    'network_policy': {
        'allowed_outbound_domains': list,
        'blocked_outbound_domains': list,
        'block_public_internet': bool,
    },
    'secret_access': {
        'allowed_bundles': list,
        'denied_providers': list,
    },
    'data_access': {
        'allowed_databases': list,
        'read_only_databases': list,
        'blocked_tables': list,
    },
    'audit_policy': {
        'log_all_prompts': bool,
        'log_all_responses': bool,
        'log_tool_calls': bool,
        'retention_days': int,
    },
    'session_policy': {
        'max_session_duration_hours': int,
        'idle_timeout_minutes': int,
        'require_mfa': bool,
    },
    'data_retention': {
        'event_retention_days': int,
        'audit_log_retention_days': int,
        'auto_delete_user_data': bool,
    },
}
