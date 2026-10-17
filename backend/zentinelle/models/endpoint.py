import uuid

from django.db import models
from django.utils import timezone

from zentinelle.models.base import Tracking
from zentinelle.utils.api_keys import PREFIX_RANDOM_CHARS, KeyPrefixes
from zentinelle.utils.api_keys import generate_api_key as _generate_api_key
from zentinelle.utils.api_keys import lookup_prefixes
from zentinelle.utils.api_keys import verify_api_key as _verify_api_key


class AgentEndpoint(Tracking):
    """
    An agent endpoint that Zentinelle manages.
    Examples: JunoHub instance, chat bot, LangChain agent, MCP server
    """

    class AgentType(models.TextChoices):
        CLAUDE_CODE = 'claude_code', 'Claude Code'
        # The Gemini *API*, not the Gemini CLI. The CLI is deprecated and its
        # successor is Antigravity, below; this value stays because an agent
        # calling Gemini through /proxy/google/ is still a Gemini agent.
        GEMINI = 'gemini', 'Gemini'
        ANTIGRAVITY = 'antigravity', 'Antigravity CLI'
        OPENCODE = 'opencode', 'OpenCode'
        CODEX = 'codex', 'Codex'
        CALLIOPE = 'calliope', 'Calliope AI'
        LANGCHAIN = 'langchain', 'LangChain'
        LANGGRAPH = 'langgraph', 'LangGraph'
        # The harnesses the SDK ships a plugin for. Each value is the string
        # that plugin actually registers with, which is why the Microsoft one
        # is hyphenated and the rest are not: changing it here would reject
        # every agent already running that plugin.
        CREWAI = 'crewai', 'CrewAI'
        LLAMAINDEX = 'llamaindex', 'LlamaIndex'
        MS_AGENT_FRAMEWORK = 'ms-agent-framework', 'Microsoft Agent Framework'
        OPENAI_AGENTS = 'openai_agents', 'OpenAI Agents SDK'
        # Tier 2 harnesses (#214). New values, so they take the underscore
        # spelling the rest of this enum uses rather than each framework's own
        # punctuation; nothing is registered under them yet to break.
        AGNO = 'agno', 'Agno'
        GOOGLE_ADK = 'google_adk', 'Google ADK'
        HAYSTACK = 'haystack', 'Haystack'
        LETTA = 'letta', 'Letta'
        PYDANTIC_AI = 'pydantic_ai', 'Pydantic AI'
        SMOLAGENTS = 'smolagents', 'Smolagents'
        # Tier 3 harnesses (#215). Qwen and DeepSeek are deliberately absent:
        # both are OpenAI-compatible and reach the existing /proxy/openai/
        # route unchanged, so a separate value would name a distinction the
        # gateway does not make.
        BEE_AGENT = 'bee_agent', 'BeeAI Framework'
        DSPY = 'dspy', 'DSPy'
        MISTRAL_AGENTS = 'mistral_agents', 'Mistral Agents'
        SPRING_AI = 'spring_ai', 'Spring AI'
        VERCEL_AI = 'vercel-ai', 'Vercel AI SDK'
        MCP = 'mcp', 'MCP Server'
        # One key per Agent Host Protocol host, which runs many sessions
        # across harnesses. Harness, session and chat travel in each
        # /evaluate context instead of registering every session (#377).
        AGENT_HOST = 'agent_host', 'Agent Host'
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
        db_index=True,
        help_text='Unique identifier for this agent within a tenant (e.g., junohub-prod-west-2)'
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
        max_length=32,
        help_text='sk_agent_ and the first 16 random characters of the key (3 for keys minted before)'
    )
    # Null means the key never expires. Short-lived keys are minted per task
    # by platforms such as Astrolift and refused once past this time.
    api_key_expires_at = models.DateTimeField(null=True, blank=True)
    registered_at = models.DateTimeField(auto_now_add=True)
    # True only for an agent the bootstrap /register path created. That path
    # may re-register (restart) only these: an agent the portal, the operator
    # API, a management command or Astrolift made has a key someone else
    # issued, and a tenant-wide bootstrap token must not replace it.
    bootstrap_registered = models.BooleanField(default=False)
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
    sub_organization_id_ext = models.CharField(max_length=255, blank=True, default='')
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

    # The Astrolift install that minted this agent's key for one of its tasks
    # or boxes (#400). Only that install may mint it again, renew or revoke
    # it, and disconnecting the install terminates it.
    astrolift_install = models.ForeignKey(
        'zentinelle.AstroliftInstall',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='agents',
    )
    # The cluster the install minted this agent's key for, when it named one
    # (#389), so agents and their usage can be filtered by cluster.
    astrolift_cluster = models.ForeignKey(
        'zentinelle.AstroliftCluster',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='agents',
    )
    # When the key was minted: an install-minted key never works longer than
    # ASTROLIFT_AGENT_KEY_MAX_LIFETIME_SECONDS after this, however renewed.
    api_key_issued_at = models.DateTimeField(null=True, blank=True)
    # The expiry the audit chain last recorded for an install-minted key, at
    # its mint or its last audited renewal, and the renewals since (#412).
    api_key_audited_expires_at = models.DateTimeField(null=True, blank=True)
    api_key_renewals_unaudited = models.PositiveIntegerField(default=0)
    # Set only when the minting install revoked the agent, the one stop that
    # install may undo by minting again. Every other stop (an administrator,
    # the operator API, the agent itself) clears it, so it stays stopped.
    astrolift_revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['tenant_id', 'name']
        unique_together = [('tenant_id', 'agent_id')]
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
        return _generate_api_key(prefix=KeyPrefixes.AGENT,
                                 prefix_length=len(KeyPrefixes.AGENT) + PREFIX_RANDOM_CHARS)

    @classmethod
    def key_prefixes(cls, api_key: str) -> list[str]:
        """The stored api_key_prefix values `api_key` can match."""
        return lookup_prefixes(api_key, KeyPrefixes.AGENT, legacy_length=12)

    @classmethod
    def verify_api_key(cls, api_key: str, key_hash: str) -> bool:
        """
        Verify an API key against its bcrypt hash.
        Uses constant-time comparison to prevent timing attacks. Unsalted
        SHA-256 hashes are refused: nothing mints them.
        """
        return _verify_api_key(api_key, key_hash, allow_legacy_sha256=False)

    def api_key_expired(self) -> bool:
        return self.api_key_expires_at is not None and self.api_key_expires_at <= timezone.now()

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

    def update_heartbeat(self, health: str = None, at=None):
        """Record a heartbeat sent at `at` (default now), and optionally its health.

        A heartbeat no newer than the one on record changes nothing, and one
        already past the health threshold moves the timestamp but not the
        health: a delayed heartbeat must not mark a dead agent healthy. The
        update is conditional in SQL so a slow writer cannot move the
        timestamp backwards past a concurrent newer one.
        """
        at = at or timezone.now()
        fields = {'last_heartbeat': at, 'updated_at': timezone.now()}
        if health and health in self.Health.values and \
                at >= timezone.now() - timezone.timedelta(minutes=5):
            fields['health'] = health
        updated = type(self).objects.filter(pk=self.pk).filter(
            models.Q(last_heartbeat__isnull=True) | models.Q(last_heartbeat__lt=at),
        ).update(**fields)
        if updated:
            for name, value in fields.items():
                setattr(self, name, value)

    def is_healthy(self, threshold_minutes: int = 5) -> bool:
        """Check if endpoint has sent a heartbeat recently."""
        if not self.last_heartbeat:
            return False
        threshold = timezone.now() - timezone.timedelta(minutes=threshold_minutes)
        return self.last_heartbeat >= threshold
