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
    Manages tenants internally using Zentinelle's own database.
    """

    def get_tenant(self, tenant_id: str) -> Optional[TenantContext]:
        # TODO: implement using internal Tenant model (to be created during extraction)
        raise NotImplementedError

    def validate_token(self, token: str) -> AuthContext:
        # TODO: implement JWT validation for standalone mode
        raise NotImplementedError


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
