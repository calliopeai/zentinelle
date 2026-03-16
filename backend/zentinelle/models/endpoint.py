import uuid

from django.db import models
from django.utils import timezone

from zentinelle.models.base import Tracking
from zentinelle.utils.api_keys import generate_api_key as _generate_api_key
from zentinelle.utils.api_keys import verify_api_key as _verify_api_key
from zentinelle.utils.api_keys import KeyPrefixes


class AgentEndpoint(Tracking):
    """
    An agent endpoint that Zentinelle manages.
    Examples: JunoHub instance, chat bot, LangChain agent, MCP server
    """

    class AgentType(models.TextChoices):
        CLAUDE_CODE = 'claude_code', 'Claude Code'
        GEMINI = 'gemini', 'Gemini'
        CODEX = 'codex', 'Codex'
        JUNOHUB = 'junohub', 'JunoHub'
        LANGCHAIN = 'langchain', 'LangChain'
        LANGGRAPH = 'langgraph', 'LangGraph'
        MCP = 'mcp', 'MCP Server'
        CHAT = 'chat', 'Chat Agent'
        CUSTOM = 'custom', 'Custom'

    class Status(models.TextChoices):
        PROVISIONING = 'provisioning', 'Provisioning'
        ACTIVE = 'active', 'Active'
        SUSPENDED = 'suspended', 'Suspended'
        OFFLINE = 'offline', 'Offline'
        TERMINATED = 'terminated', 'Terminated'

    class Health(models.TextChoices):
        HEALTHY = 'healthy', 'Healthy'
        DEGRADED = 'degraded', 'Degraded'
        UNHEALTHY = 'unhealthy', 'Unhealthy'
        UNKNOWN = 'unknown', 'Unknown'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # TODO: decouple - organization FK removed (use tenant_id instead)
    tenant_id = models.CharField(max_length=255, db_index=True, blank=True, default="")

    # Identity
    agent_id = models.SlugField(
        max_length=100,
        unique=True,
        db_index=True,
        help_text='Unique identifier for this agent (e.g., junohub-prod-west-2)'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    agent_type = models.CharField(
        max_length=50,
        choices=AgentType.choices,
        default=AgentType.CUSTOM
    )

    # Registration & Auth
    api_key_hash = models.CharField(max_length=255)
    api_key_prefix = models.CharField(
        max_length=12,
        help_text='First 8 chars of API key for identification'
    )
    registered_at = models.DateTimeField(auto_now_add=True)
    last_heartbeat = models.DateTimeField(null=True, blank=True)

    # Status
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )
    health = models.CharField(
        max_length=20,
        choices=Health.choices,
        default=Health.UNKNOWN
    )

    # Capabilities & Config
    capabilities = models.JSONField(
        default=list,
        blank=True,
        help_text='List of capabilities: ["lab", "chat", "langflow", "browser"]'
    )
    metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text='Agent metadata: {"cluster": "ecs-west-2", "version": "1.2.3"}'
    )
    config = models.JSONField(
        default=dict,
        blank=True,
        help_text='Runtime config to push to agent'
    )

    # Optional deployment reference (standalone: store as string)
    deployment_id_ext = models.CharField(
        max_length=255, blank=True, default='',
        help_text='External deployment ID reference'
    )

    # Agent Group
    group = models.ForeignKey(
        'zentinelle.AgentGroup',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='agents',
    )

    class Meta:
        ordering = ['tenant_id', 'name']
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['agent_type', 'status']),
            models.Index(fields=['last_heartbeat']),
            models.Index(fields=['api_key_prefix']),
        ]

    def __str__(self):
        return f"{self.name} ({self.agent_id})"

    @classmethod
    def generate_api_key(cls) -> tuple[str, str, str]:
        """
        Generate a new API key.
        Returns: (full_key, key_hash, key_prefix)

        Uses the centralized API key utility with bcrypt hashing.
        """
        return _generate_api_key(prefix=KeyPrefixes.AGENT, prefix_length=12)

    @classmethod
    def verify_api_key(cls, api_key: str, key_hash: str) -> bool:
        """
        Verify an API key against its bcrypt hash.
        Uses constant-time comparison to prevent timing attacks.
        """
        return _verify_api_key(api_key, key_hash, allow_legacy_sha256=True)

    def rotate_api_key(self) -> str:
        """
        Rotate the API key for this endpoint.
        Returns the new API key (only time it's visible).
        """
        full_key, key_hash, key_prefix = self.generate_api_key()
        self.api_key_hash = key_hash
        self.api_key_prefix = key_prefix
        self.save(update_fields=['api_key_hash', 'api_key_prefix', 'updated_at'])
        return full_key

    def update_heartbeat(self, health: str = None):
        """Update last heartbeat timestamp and optionally health status."""
        self.last_heartbeat = timezone.now()
        if health and health in self.Health.values:
            self.health = health
        self.save(update_fields=['last_heartbeat', 'health', 'updated_at'])

    def is_healthy(self, threshold_minutes: int = 5) -> bool:
        """Check if endpoint has sent a heartbeat recently."""
        if not self.last_heartbeat:
            return False
        threshold = timezone.now() - timezone.timedelta(minutes=threshold_minutes)
        return self.last_heartbeat >= threshold
