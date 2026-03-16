from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class TenantContext:
    tenant_id: str
    name: str
    status: str  # "active" | "inactive" | "suspended"
    features: List[str]
    agent_limit: int
    plan: str


@dataclass
class AuthContext:
    valid: bool
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None
    scopes: List[str] = field(default_factory=list)
    error: Optional[str] = None


class TenantResolver(ABC):
    """
    Interface for resolving tenant context and validating auth tokens.

    Implement this to connect Zentinelle to any identity/auth system.
    The default implementation (StandaloneTenantResolver) manages tenants
    internally. In Calliope AI managed deployments, ClientCoveTenantResolver
    delegates to Client Cove's internal API.
    """

    @abstractmethod
    def get_tenant(self, tenant_id: str) -> Optional[TenantContext]:
        """Resolve tenant context by ID. Returns None if tenant not found."""
        ...

    @abstractmethod
    def validate_token(self, token: str) -> AuthContext:
        """Validate an auth token and return tenant/user context."""
        ...


class StandaloneTenantResolver(TenantResolver):
    """
    Default resolver for self-hosted Zentinelle deployments.
    Resolves tenant context from ZentinelleLicense records.
    Validates tokens via:
      - DEBUG mode: any non-empty token accepted
      - Bearer sk_platform_*: platform API key lookup
      - Bearer sk_agent_*: agent endpoint key lookup
      - Basic <b64>: Django session auth (portal users)
    """

    _DEFAULT_FEATURES = [
        "policy_engine",
        "content_scanning",
        "compliance_reports",
        "audit_trail",
        "risk_management",
    ]

    def get_tenant(self, tenant_id: str) -> Optional[TenantContext]:
        try:
            from zentinelle.models.license import ZentinelleLicense
            lic = ZentinelleLicense.objects.filter(tenant_id=tenant_id).first()
            if lic:
                import django.utils.timezone as tz
                if lic.valid_until and lic.valid_until < tz.now():
                    status = "expired"
                else:
                    status = "active"
                return TenantContext(
                    tenant_id=tenant_id,
                    name=tenant_id,
                    status=status,
                    features=list(lic.features.keys()) if isinstance(lic.features, dict) else self._DEFAULT_FEATURES,
                    agent_limit=lic.agent_entitlement_count or 1000,
                    plan="self-hosted",
                )
        except Exception:
            pass

        # No license record — return permissive default for self-hosted
        return TenantContext(
            tenant_id=tenant_id,
            name=tenant_id,
            status="active",
            features=self._DEFAULT_FEATURES,
            agent_limit=1000,
            plan="self-hosted",
        )

    def validate_token(self, token: str) -> AuthContext:
        import os

        # Dev mode: accept any non-empty token
        if os.environ.get("DEBUG", "False").lower() in ("1", "true", "yes"):
            if token:
                return AuthContext(
                    valid=True,
                    tenant_id="default",
                    user_id="dev-user",
                    scopes=["*"],
                )

        if not token:
            return AuthContext(valid=False, error="missing_token")

        # Bearer token
        if token.startswith("Bearer "):
            raw = token[7:].strip()
            return self._validate_bearer(raw)

        # Basic auth (Django session / admin portal)
        if token.startswith("Basic "):
            return self._validate_basic(token[6:])

        return AuthContext(valid=False, error="unsupported_auth_scheme")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _validate_bearer(self, raw: str) -> AuthContext:
        """Validate a raw Bearer token value (without the 'Bearer ' prefix)."""
        from zentinelle.utils.api_keys import KeyPrefixes

        if raw.startswith(KeyPrefixes.AGENT):
            return self._validate_agent_key(raw)

        # Platform keys and znt_ legacy prefix both hit the APIKey table
        return self._validate_platform_key(raw)

    def _validate_platform_key(self, raw: str) -> AuthContext:
        """Look up an APIKey record by prefix, verify with bcrypt."""
        try:
            from zentinelle.models.api_key import APIKey
            from django.utils import timezone

            # Extract the stored prefix (first 15 chars — matches KeyPrefixes.PLATFORM + 8 chars)
            key_prefix = raw[:15]
            candidates = APIKey.objects.filter(
                key_prefix=key_prefix,
                status=APIKey.Status.ACTIVE,
            )

            for key_obj in candidates:
                # Check expiry
                if key_obj.expires_at and key_obj.expires_at < timezone.now():
                    continue
                if APIKey.verify_api_key(raw, key_obj.key_hash):
                    key_obj.record_usage()
                    return AuthContext(
                        valid=True,
                        tenant_id=key_obj.tenant_id,
                        user_id=key_obj.user_id,
                        scopes=key_obj.scopes or ["read", "write"],
                    )
        except Exception:
            pass

        return AuthContext(valid=False, error="invalid_api_key")

    def _validate_agent_key(self, raw: str) -> AuthContext:
        """Look up an AgentEndpoint by key prefix and verify."""
        try:
            from zentinelle.models.endpoint import AgentEndpoint

            key_prefix = raw[:12]  # AGENT prefix_length=12
            candidates = AgentEndpoint.objects.filter(
                api_key_prefix=key_prefix,
                status=AgentEndpoint.Status.ACTIVE,
            )

            for endpoint in candidates:
                if AgentEndpoint.verify_api_key(raw, endpoint.api_key_hash):
                    return AuthContext(
                        valid=True,
                        tenant_id=endpoint.tenant_id,
                        user_id=f"agent:{endpoint.id}",
                        scopes=["agent"],
                    )
        except Exception:
            pass

        return AuthContext(valid=False, error="invalid_agent_key")

    def _validate_basic(self, b64: str) -> AuthContext:
        """Validate HTTP Basic auth credentials via Django authenticate."""
        try:
            from django.contrib.auth import authenticate
            import base64

            decoded = base64.b64decode(b64).decode()
            username, _, password = decoded.partition(":")
            user = authenticate(username=username, password=password)
            if user and user.is_active:
                return AuthContext(
                    valid=True,
                    tenant_id="default",
                    user_id=str(user.pk),
                    scopes=["admin"] if user.is_staff else ["user"],
                )
        except Exception:
            pass

        return AuthContext(valid=False, error="invalid_credentials")


class ClientCoveTenantResolver(TenantResolver):
    """
    Resolver for Calliope AI-managed deployments.

    Delegates tenant resolution and token validation to Client Cove's
    internal service-to-service API. Responses are cached in Redis to
    avoid hammering Client Cove on every request.

    Required env vars (set via calliope.md / managed deployment secrets):
      CALLIOPE_INTERNAL_API_URL   — base URL of Client Cove internal API
      CALLIOPE_INTERNAL_API_KEY   — service-to-service bearer token
      CALLIOPE_TENANT_CACHE_TTL   — cache TTL in seconds (default: 300)
    """

    def __init__(self):
        import os
        self._base_url = os.environ.get("CALLIOPE_INTERNAL_API_URL", "").rstrip("/")
        self._api_key = os.environ.get("CALLIOPE_INTERNAL_API_KEY", "")
        self._cache_ttl = int(os.environ.get("CALLIOPE_TENANT_CACHE_TTL", "300"))

        if not self._base_url or not self._api_key:
            raise RuntimeError(
                "ClientCoveTenantResolver requires CALLIOPE_INTERNAL_API_URL "
                "and CALLIOPE_INTERNAL_API_KEY env vars"
            )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "X-Service": "zentinelle",
        }

    def get_tenant(self, tenant_id: str) -> Optional[TenantContext]:
        from django.core.cache import cache
        import httpx

        cache_key = f"cove:tenant:{tenant_id}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            resp = httpx.get(
                f"{self._base_url}/internal/zentinelle/tenant/{tenant_id}/",
                headers=self._headers(),
                timeout=5.0,
            )
            resp.raise_for_status()
            data = resp.json()
            ctx = TenantContext(
                tenant_id=data["tenant_id"],
                name=data.get("name", tenant_id),
                status=data.get("status", "active"),
                features=data.get("features", []),
                agent_limit=data.get("agent_limit", 1000),
                plan=data.get("plan", "managed"),
            )
            cache.set(cache_key, ctx, timeout=self._cache_ttl)
            return ctx
        except Exception:
            return None

    def validate_token(self, token: str) -> AuthContext:
        from django.core.cache import cache
        import hashlib
        import httpx

        cache_key = f"cove:auth:{hashlib.sha256(token.encode()).hexdigest()[:16]}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            resp = httpx.post(
                f"{self._base_url}/internal/zentinelle/auth/validate/",
                headers=self._headers(),
                json={"token": token},
                timeout=5.0,
            )
            resp.raise_for_status()
            data = resp.json()
            ctx = AuthContext(
                valid=data.get("valid", False),
                tenant_id=data.get("tenant_id"),
                user_id=data.get("user_id"),
                scopes=data.get("scopes", []),
                error=data.get("error"),
            )
            if ctx.valid:
                cache.set(cache_key, ctx, timeout=60)  # short TTL for auth
            return ctx
        except Exception as exc:
            return AuthContext(valid=False, error=f"upstream_error: {exc}")


def get_resolver() -> TenantResolver:
    """
    Factory function — returns the configured TenantResolver.
    Set AUTH_MODE env var to select implementation.
    """
    import os

    mode = os.environ.get("AUTH_MODE", "standalone")

    if mode == "standalone":
        return StandaloneTenantResolver()
    if mode == "client_cove":
        return ClientCoveTenantResolver()
    raise ValueError(f"Unknown AUTH_MODE: {mode}")
