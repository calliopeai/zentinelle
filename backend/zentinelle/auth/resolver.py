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
    internally. In Calliope managed deployments, ClientCoveTenantResolver
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
    Validates tokens via Django session auth (portal) or API key (agents).
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

        # Try Django session / user lookup via token as username:password basic
        try:
            from django.contrib.auth import authenticate
            import base64
            if token.startswith("Basic "):
                decoded = base64.b64decode(token[6:]).decode()
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

        return AuthContext(valid=False, error="invalid_token")


def get_resolver() -> TenantResolver:
    """
    Factory function -- returns the configured TenantResolver.
    Set AUTH_MODE env var to select implementation.
    """
    import os

    mode = os.environ.get("AUTH_MODE", "standalone")

    if mode == "standalone":
        return StandaloneTenantResolver()
    # Other modes (e.g. "client_cove") are configured via calliope.md
    # and loaded by the managed deployment layer
    raise ValueError(f"Unknown AUTH_MODE: {mode}")
