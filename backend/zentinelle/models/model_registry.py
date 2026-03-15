"""
AI Model Registry - Approved models with risk classification.

Organizations can maintain a registry of approved AI models with:
- Risk classification (for EU AI Act compliance)
- Approval workflow
- Usage restrictions per deployment/team
- Cost tracking metadata
"""
import uuid
from django.db import models
from django.conf import settings
from zentinelle.models.base import Tracking


class AIModel(Tracking):
    """
    A specific AI model available for use.

    Models can be globally defined (by Zentinelle) or organization-specific.
    Organizations can approve/restrict models for their deployments.
    """

    class ModelType(models.TextChoices):
        LLM = 'llm', 'Large Language Model'
        EMBEDDING = 'embedding', 'Embedding Model'
        IMAGE_GEN = 'image_gen', 'Image Generation'
        SPEECH_TO_TEXT = 'speech_to_text', 'Speech to Text'
        TEXT_TO_SPEECH = 'text_to_speech', 'Text to Speech'
        MULTIMODAL = 'multimodal', 'Multimodal'
        CODE = 'code', 'Code Generation'
        REASONING = 'reasoning', 'Reasoning/Chain-of-Thought'

    class RiskLevel(models.TextChoices):
        """EU AI Act risk classification."""
        MINIMAL = 'minimal', 'Minimal Risk'
        LIMITED = 'limited', 'Limited Risk'
        HIGH = 'high', 'High Risk'
        UNACCEPTABLE = 'unacceptable', 'Unacceptable Risk'
        UNKNOWN = 'unknown', 'Not Classified'

    class Capability(models.TextChoices):
        """Model capabilities for filtering."""
        CHAT = 'chat', 'Chat/Conversation'
        COMPLETION = 'completion', 'Text Completion'
        FUNCTION_CALLING = 'function_calling', 'Function/Tool Calling'
        VISION = 'vision', 'Vision/Image Understanding'
        CODE_INTERPRETER = 'code_interpreter', 'Code Interpreter'
        WEB_SEARCH = 'web_search', 'Web Search'
        FILE_UPLOAD = 'file_upload', 'File Upload'
        LONG_CONTEXT = 'long_context', 'Long Context (100K+)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Provider relationship
    provider = models.ForeignKey(
        'zentinelle.AIProvider',
        on_delete=models.CASCADE,
        related_name='models'
    )

    # Identity
    model_id = models.CharField(
        max_length=100,
        help_text='Provider model ID: gpt-4o, claude-opus-4-20250514, etc.'
    )
    name = models.CharField(max_length=200, help_text='Display name')
    description = models.TextField(blank=True)

    # Classification
    model_type = models.CharField(
        max_length=20,
        choices=ModelType.choices,
        default=ModelType.LLM
    )
    risk_level = models.CharField(
        max_length=20,
        choices=RiskLevel.choices,
        default=RiskLevel.UNKNOWN
    )

    # Capabilities (stored as list for flexibility)
    capabilities = models.JSONField(
        default=list,
        blank=True,
        help_text='List of capability values'
    )

    # Context & limits
    context_window = models.IntegerField(
        null=True,
        blank=True,
        help_text='Max context window in tokens'
    )
    max_output_tokens = models.IntegerField(
        null=True,
        blank=True,
        help_text='Max output tokens'
    )

    # Pricing (per 1M tokens, for cost estimation)
    input_price_per_million = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Price per 1M input tokens (USD)'
    )
    output_price_per_million = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Price per 1M output tokens (USD)'
    )

    # Availability
    is_available = models.BooleanField(
        default=True,
        help_text='Is model currently available from provider?'
    )
    deprecated = models.BooleanField(default=False)
    deprecation_date = models.DateField(null=True, blank=True)
    replacement_model = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='replaces',
        help_text='Recommended replacement when deprecated'
    )

    # Global model (defined by Zentinelle) vs custom
    is_global = models.BooleanField(
        default=True,
        help_text='Global models are available to all orgs'
    )

    # Metadata
    release_date = models.DateField(null=True, blank=True)
    documentation_url = models.URLField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = 'AI Model'
        verbose_name_plural = 'AI Models'
        ordering = ['provider', 'name']
        unique_together = ['provider', 'model_id']
        indexes = [
            models.Index(fields=['model_type', 'is_available']),
            models.Index(fields=['risk_level']),
        ]

    def __str__(self):
        return f"{self.provider.name}: {self.name}"

    @property
    def full_model_id(self) -> str:
        """Return provider:model_id format."""
        return f"{self.provider.slug}:{self.model_id}"


class OrganizationModelApproval(Tracking):
    """
    Organization-level model approval status.

    Controls which models are approved for use within an organization.
    Ties into model_restriction policies.
    """

    class ApprovalStatus(models.TextChoices):
        PENDING = 'pending', 'Pending Review'
        APPROVED = 'approved', 'Approved'
        RESTRICTED = 'restricted', 'Restricted Use'
        DENIED = 'denied', 'Denied'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    model = models.ForeignKey(
        AIModel,
        on_delete=models.CASCADE,
        related_name='org_approvals'
    )

    # Approval status
    status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.PENDING
    )

    # Restrictions (when status=restricted)
    # TODO: decouple - allowed_deployments M2M removed
    # TODO: decouple - allowed_sub_organizations M2M removed
    max_daily_requests = models.IntegerField(
        null=True,
        blank=True,
        help_text='Daily request limit (null = unlimited)'
    )
    max_monthly_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Monthly cost limit in USD'
    )

    # Use case requirements
    requires_justification = models.BooleanField(
        default=False,
        help_text='Require use case justification before use'
    )
    requires_approval = models.BooleanField(
        default=False,
        help_text='Require per-use approval'
    )

    # Review tracking
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewer_id = models.CharField(max_length=255, blank=True, default="")
    review_notes = models.TextField(blank=True)

    # Audit — who requested the approval
    user_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    class Meta:
        verbose_name = 'Model Approval'
        verbose_name_plural = 'Model Approvals'
        unique_together = ['tenant_id', 'model']
        ordering = ['tenant_id', 'model__provider', 'model__name']

    def __str__(self):
        return f"tenant={self.tenant_id}: {self.model.name} ({self.status})"

    @property
    def is_usable(self) -> bool:
        """Check if model can be used."""
        return self.status in [
            self.ApprovalStatus.APPROVED,
            self.ApprovalStatus.RESTRICTED,
        ]


class ModelUsageLog(Tracking):
    """
    Tracks model usage for compliance reporting.

    Aggregated usage by model per org/deployment.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")
    model = models.ForeignKey(
        AIModel,
        on_delete=models.CASCADE,
        related_name='usage_logs'
    )
    # TODO: decouple - deployment FK removed
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )

    # Period
    period_start = models.DateTimeField()
    period_end = models.DateTimeField()

    # Usage
    request_count = models.IntegerField(default=0)
    input_tokens = models.BigIntegerField(default=0)
    output_tokens = models.BigIntegerField(default=0)
    total_tokens = models.BigIntegerField(default=0)

    # Cost
    estimated_cost_usd = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=0
    )

    # User breakdown (optional)
    unique_users = models.IntegerField(default=0)

    class Meta:
        verbose_name = 'Model Usage Log'
        verbose_name_plural = 'Model Usage Logs'
        ordering = ['-period_start']
        indexes = [
            models.Index(fields=['tenant_id', 'model', '-period_start']),
            models.Index(fields=['deployment_id_ext', '-period_start']),
        ]

    def __str__(self):
        return f"{self.model.name} usage: {self.request_count} requests"


# ============================================================================
# Default model fixtures
# ============================================================================

MODEL_FIXTURES = [
    # OpenAI
    {
        'provider_slug': 'openai',
        'model_id': 'gpt-4o',
        'name': 'GPT-4o',
        'model_type': 'multimodal',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling'],
        'context_window': 128000,
        'max_output_tokens': 16384,
        'input_price_per_million': 2.50,
        'output_price_per_million': 10.00,
    },
    {
        'provider_slug': 'openai',
        'model_id': 'gpt-4o-mini',
        'name': 'GPT-4o Mini',
        'model_type': 'llm',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling'],
        'context_window': 128000,
        'max_output_tokens': 16384,
        'input_price_per_million': 0.15,
        'output_price_per_million': 0.60,
    },
    {
        'provider_slug': 'openai',
        'model_id': 'o1',
        'name': 'o1 (Reasoning)',
        'model_type': 'reasoning',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling'],
        'context_window': 200000,
        'max_output_tokens': 100000,
        'input_price_per_million': 15.00,
        'output_price_per_million': 60.00,
    },
    # Anthropic
    {
        'provider_slug': 'anthropic',
        'model_id': 'claude-opus-4-20250514',
        'name': 'Claude Opus 4',
        'model_type': 'multimodal',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling', 'long_context'],
        'context_window': 200000,
        'max_output_tokens': 32000,
        'input_price_per_million': 15.00,
        'output_price_per_million': 75.00,
    },
    {
        'provider_slug': 'anthropic',
        'model_id': 'claude-sonnet-4-20250514',
        'name': 'Claude Sonnet 4',
        'model_type': 'multimodal',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling', 'long_context'],
        'context_window': 200000,
        'max_output_tokens': 64000,
        'input_price_per_million': 3.00,
        'output_price_per_million': 15.00,
    },
    {
        'provider_slug': 'anthropic',
        'model_id': 'claude-3-5-haiku-20241022',
        'name': 'Claude 3.5 Haiku',
        'model_type': 'llm',
        'risk_level': 'minimal',
        'capabilities': ['chat', 'vision', 'function_calling'],
        'context_window': 200000,
        'max_output_tokens': 8192,
        'input_price_per_million': 0.80,
        'output_price_per_million': 4.00,
    },
    # Google
    {
        'provider_slug': 'google',
        'model_id': 'gemini-2.0-flash',
        'name': 'Gemini 2.0 Flash',
        'model_type': 'multimodal',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling'],
        'context_window': 1000000,
        'max_output_tokens': 8192,
        'input_price_per_million': 0.075,
        'output_price_per_million': 0.30,
    },
    {
        'provider_slug': 'google',
        'model_id': 'gemini-2.5-pro',
        'name': 'Gemini 2.5 Pro',
        'model_type': 'reasoning',
        'risk_level': 'limited',
        'capabilities': ['chat', 'vision', 'function_calling', 'long_context'],
        'context_window': 1000000,
        'max_output_tokens': 65536,
        'input_price_per_million': 1.25,
        'output_price_per_million': 10.00,
    },
    # Mistral
    {
        'provider_slug': 'mistral',
        'model_id': 'mistral-large-latest',
        'name': 'Mistral Large',
        'model_type': 'llm',
        'risk_level': 'limited',
        'capabilities': ['chat', 'function_calling'],
        'context_window': 128000,
        'max_output_tokens': 8192,
        'input_price_per_million': 2.00,
        'output_price_per_million': 6.00,
    },
    # DeepSeek
    {
        'provider_slug': 'deepseek',
        'model_id': 'deepseek-chat',
        'name': 'DeepSeek V3',
        'model_type': 'llm',
        'risk_level': 'unknown',
        'capabilities': ['chat', 'function_calling'],
        'context_window': 64000,
        'max_output_tokens': 8192,
        'input_price_per_million': 0.27,
        'output_price_per_million': 1.10,
    },
    {
        'provider_slug': 'deepseek',
        'model_id': 'deepseek-reasoner',
        'name': 'DeepSeek R1',
        'model_type': 'reasoning',
        'risk_level': 'unknown',
        'capabilities': ['chat'],
        'context_window': 64000,
        'max_output_tokens': 8192,
        'input_price_per_million': 0.55,
        'output_price_per_million': 2.19,
    },
]


def load_model_fixtures():
    """Load or update model fixtures. Requires providers to exist first."""
    from zentinelle.models import AIProvider

    for data in MODEL_FIXTURES:
        provider_slug = data.pop('provider_slug')
        provider = AIProvider.objects.filter(slug=provider_slug).first()
        if not provider:
            continue

        AIModel.objects.update_or_create(
            provider=provider,
            model_id=data['model_id'],
            defaults={**data, 'is_global': True}
        )
