"""
AI Provider Registry - Pre-registered vendors with capabilities.

Each provider has different capabilities:
- Managed Keys: Can we create/manage API keys via their Admin API?
- Usage API: Can we query usage statistics?
- Per-Key Stats: Does usage API provide per-key breakdowns?
- Admin API: Full admin API for key lifecycle management?
"""
import uuid
from django.db import models
from zentinelle.models.base import Tracking


class AIProvider(Tracking):
    """
    Registry of AI providers and their capabilities.

    This is a reference table - providers are pre-registered with their
    known capabilities. When capabilities change (new API features),
    update this table.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Identity
    slug = models.SlugField(unique=True, help_text='Unique identifier: openai, anthropic, etc.')
    name = models.CharField(max_length=100, help_text='Display name: OpenAI, Anthropic, etc.')
    logo_url = models.URLField(blank=True, help_text='Provider logo for UI')

    # Capabilities - Key Management
    supports_managed_keys = models.BooleanField(
        default=False,
        help_text='Can create/manage API keys via Admin API'
    )
    supports_key_creation = models.BooleanField(
        default=False,
        help_text='Can programmatically create new API keys'
    )
    supports_key_deletion = models.BooleanField(
        default=False,
        help_text='Can programmatically delete/revoke API keys'
    )
    supports_key_rotation = models.BooleanField(
        default=False,
        help_text='Can rotate keys without manual intervention'
    )
    supports_per_key_limits = models.BooleanField(
        default=False,
        help_text='Can set usage/budget limits per API key'
    )

    # Capabilities - Usage & Stats
    supports_usage_api = models.BooleanField(
        default=False,
        help_text='Provides API to query usage statistics'
    )
    supports_per_key_stats = models.BooleanField(
        default=False,
        help_text='Usage API provides per-key breakdowns'
    )
    supports_realtime_usage = models.BooleanField(
        default=False,
        help_text='Usage stats available in near real-time'
    )
    usage_delay_minutes = models.IntegerField(
        default=60,
        help_text='Typical delay before usage data is available'
    )

    # API Configuration
    admin_api_base_url = models.URLField(
        blank=True,
        help_text='Base URL for Admin API'
    )
    usage_api_base_url = models.URLField(
        blank=True,
        help_text='Base URL for Usage API (if different)'
    )
    api_docs_url = models.URLField(
        blank=True,
        help_text='Link to API documentation'
    )

    # Key format hints
    key_prefix = models.CharField(
        max_length=20,
        blank=True,
        help_text='Expected key prefix for validation: sk-, sk-ant-, etc.'
    )
    key_env_var = models.CharField(
        max_length=50,
        blank=True,
        help_text='Standard env var name: OPENAI_API_KEY, ANTHROPIC_API_KEY'
    )

    # Status
    is_active = models.BooleanField(
        default=True,
        help_text='Is this provider available for configuration?'
    )

    # Additional metadata
    notes = models.TextField(
        blank=True,
        help_text='Implementation notes, quirks, limitations'
    )
    config_schema = models.JSONField(
        default=dict,
        blank=True,
        help_text='JSON schema for provider-specific config options'
    )

    class Meta:
        verbose_name = 'AI Provider'
        verbose_name_plural = 'AI Providers'
        ordering = ['name']

    def __str__(self):
        return self.name

    @classmethod
    def get_by_slug(cls, slug: str) -> 'AIProvider':
        """Get provider by slug, returns None if not found."""
        return cls.objects.filter(slug=slug, is_active=True).first()

    @classmethod
    def get_managed_providers(cls):
        """Get all providers that support managed keys."""
        return cls.objects.filter(
            is_active=True,
            supports_managed_keys=True
        )

    @classmethod
    def get_usage_trackable_providers(cls):
        """Get all providers that support usage API queries."""
        return cls.objects.filter(
            is_active=True,
            supports_usage_api=True
        )


# ============================================================================
# Fixture data for initial provider setup
# ============================================================================

PROVIDER_FIXTURES = [
    {
        'slug': 'openai',
        'name': 'OpenAI',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': True,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 5,
        'admin_api_base_url': 'https://api.openai.com/v1/organization',
        'usage_api_base_url': 'https://api.openai.com/v1/organization/usage',
        'api_docs_url': 'https://platform.openai.com/docs/api-reference',
        'key_prefix': 'sk-',
        'key_env_var': 'OPENAI_API_KEY',
        'notes': 'Full Admin API support. Keys can have project-level isolation.',
    },
    {
        'slug': 'anthropic',
        'name': 'Anthropic',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': True,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 15,
        'admin_api_base_url': 'https://api.anthropic.com/v1/admin',
        'usage_api_base_url': 'https://api.anthropic.com/v1/usage',
        'api_docs_url': 'https://docs.anthropic.com/en/api',
        'key_prefix': 'sk-ant-',
        'key_env_var': 'ANTHROPIC_API_KEY',
        'notes': 'Admin API available. Workspace-level key management.',
    },
    {
        'slug': 'together',
        'name': 'Together AI',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': False,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 30,
        'admin_api_base_url': 'https://api.together.xyz/v1',
        'usage_api_base_url': 'https://api.together.xyz/v1/usage',
        'api_docs_url': 'https://docs.together.ai/reference',
        'key_prefix': '',
        'key_env_var': 'TOGETHER_API_KEY',
        'notes': 'API key management available. Good for open-source models.',
    },
    {
        'slug': 'google',
        'name': 'Google AI (Gemini)',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://ai.google.dev/docs',
        'key_prefix': 'AIza',
        'key_env_var': 'GOOGLE_API_KEY',
        'notes': 'Key management via Google Cloud Console only. Usage via Cloud Monitoring.',
    },
    {
        'slug': 'azure_openai',
        'name': 'Azure OpenAI',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': True,  # Via Azure Key Vault
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
        'key_prefix': '',
        'key_env_var': 'AZURE_OPENAI_API_KEY',
        'notes': 'Key management via Azure Portal. Usage via Azure Monitor/Cost Management.',
    },
    {
        'slug': 'aws_bedrock',
        'name': 'AWS Bedrock',
        'supports_managed_keys': False,
        'supports_key_creation': False,  # Uses IAM, not API keys
        'supports_key_deletion': False,
        'supports_key_rotation': True,  # Via IAM credential rotation
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://docs.aws.amazon.com/bedrock/',
        'key_prefix': '',
        'key_env_var': '',
        'notes': 'Uses IAM authentication, not API keys. Usage via CloudWatch.',
    },
    {
        'slug': 'cohere',
        'name': 'Cohere',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://docs.cohere.com/',
        'key_prefix': '',
        'key_env_var': 'COHERE_API_KEY',
        'notes': 'Key management via dashboard. Usage API available.',
    },
    {
        'slug': 'mistral',
        'name': 'Mistral AI',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 30,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://docs.mistral.ai/',
        'key_prefix': '',
        'key_env_var': 'MISTRAL_API_KEY',
        'notes': 'Key management via console. Usage available via API.',
    },
    {
        'slug': 'groq',
        'name': 'Groq',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 30,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://console.groq.com/docs/',
        'key_prefix': 'gsk_',
        'key_env_var': 'GROQ_API_KEY',
        'notes': 'Fast inference. Key management via console.',
    },
    {
        'slug': 'deepseek',
        'name': 'DeepSeek',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': '',
        'api_docs_url': 'https://platform.deepseek.com/docs',
        'key_prefix': 'sk-',
        'key_env_var': 'DEEPSEEK_API_KEY',
        'notes': 'Cost-effective reasoning models. Basic usage API.',
    },
    {
        'slug': 'fireworks',
        'name': 'Fireworks AI',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': False,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 15,
        'admin_api_base_url': 'https://api.fireworks.ai/v1',
        'usage_api_base_url': 'https://api.fireworks.ai/v1/usage',
        'api_docs_url': 'https://docs.fireworks.ai/',
        'key_prefix': '',
        'key_env_var': 'FIREWORKS_API_KEY',
        'notes': 'Good API key management. Supports fine-tuned model deployment.',
    },
    {
        'slug': 'huggingface',
        'name': 'Hugging Face',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': False,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 0,
        'admin_api_base_url': 'https://huggingface.co/api',
        'usage_api_base_url': '',
        'api_docs_url': 'https://huggingface.co/docs/hub/api',
        'key_prefix': 'hf_',
        'key_env_var': 'HUGGINGFACE_API_KEY',
        'notes': 'Token management via API. Supports Inference Endpoints and Hub API.',
    },
    {
        'slug': 'ai21',
        'name': 'AI21 Labs',
        'supports_managed_keys': False,
        'supports_key_creation': False,
        'supports_key_deletion': False,
        'supports_key_rotation': False,
        'supports_per_key_limits': False,
        'supports_usage_api': True,
        'supports_per_key_stats': False,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 60,
        'admin_api_base_url': '',
        'usage_api_base_url': 'https://api.ai21.com/studio/v1',
        'api_docs_url': 'https://docs.ai21.com/',
        'key_prefix': '',
        'key_env_var': 'AI21_API_KEY',
        'notes': 'Key management via dashboard only. Usage API available.',
    },
    {
        'slug': 'openrouter',
        'name': 'OpenRouter',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': False,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': False,
        'usage_delay_minutes': 5,
        'admin_api_base_url': 'https://openrouter.ai/api/v1',
        'usage_api_base_url': 'https://openrouter.ai/api/v1',
        'api_docs_url': 'https://openrouter.ai/docs',
        'key_prefix': 'sk-or-',
        'key_env_var': 'OPENROUTER_API_KEY',
        'notes': 'Multi-provider router. Good key management and per-key usage tracking.',
    },
    {
        'slug': 'litellm',
        'name': 'LiteLLM Proxy',
        'supports_managed_keys': True,
        'supports_key_creation': True,
        'supports_key_deletion': True,
        'supports_key_rotation': True,
        'supports_per_key_limits': True,
        'supports_usage_api': True,
        'supports_per_key_stats': True,
        'supports_realtime_usage': True,
        'usage_delay_minutes': 0,
        'admin_api_base_url': '',  # Self-hosted, configured at runtime
        'usage_api_base_url': '',
        'api_docs_url': 'https://docs.litellm.ai/',
        'key_prefix': 'sk-',
        'key_env_var': 'LITELLM_API_KEY',
        'notes': 'Self-hosted proxy. Full key management via Admin API. URL configured per deployment.',
    },
]


def load_provider_fixtures():
    """Load or update provider fixtures."""
    for data in PROVIDER_FIXTURES:
        AIProvider.objects.update_or_create(
            slug=data['slug'],
            defaults=data
        )
