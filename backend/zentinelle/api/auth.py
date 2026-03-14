"""
API Key authentication for Zentinelle agent-facing endpoints.

Supports API keys:
- sk_agent_... : AgentEndpoint keys (for spawned agents like labs/notebooks)

Note: Deployment key auth (sk_deploy_) has been removed in standalone mode.
Deployment operations are handled by the client-cove integration layer.
"""
from rest_framework import authentication, exceptions
from zentinelle.models import AgentEndpoint


class ZentinelleAPIKeyAuthentication(authentication.BaseAuthentication):
    """
    Custom authentication using X-Zentinelle-Key header.

    Usage:
        X-Zentinelle-Key: sk_agent_abc123...
    """

    keyword = 'X-Zentinelle-Key'

    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_ZENTINELLE_KEY', '')

        if not api_key:
            return None  # No API key provided, let other auth methods try

        # Validate key format
        if not api_key.startswith('sk_agent_'):
            raise exceptions.AuthenticationFailed('Invalid API key format')

        # Look up endpoint by key prefix first (fast lookup)
        key_prefix = api_key[:12]

        try:
            endpoint = AgentEndpoint.objects.get(
                api_key_prefix=key_prefix,
                status__in=[AgentEndpoint.Status.ACTIVE, AgentEndpoint.Status.PROVISIONING],
            )
        except AgentEndpoint.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid API key')

        # Verify full key hash
        if not AgentEndpoint.verify_api_key(api_key, endpoint.api_key_hash):
            raise exceptions.AuthenticationFailed('Invalid API key')

        # Check if endpoint is suspended
        if endpoint.status == AgentEndpoint.Status.SUSPENDED:
            raise exceptions.AuthenticationFailed('Endpoint is suspended')

        # Return (user, auth) tuple - we use endpoint as the "user"
        return (ZentinelleAgentUser(endpoint), api_key)

    def authenticate_header(self, request):
        return self.keyword


class ZentinelleAgentUser:
    """
    Wrapper to make AgentEndpoint work like a Django user for DRF.
    """

    def __init__(self, endpoint: AgentEndpoint):
        self.endpoint = endpoint
        self.tenant_id = endpoint.tenant_id
        self.is_authenticated = True
        self.is_active = endpoint.status == AgentEndpoint.Status.ACTIVE

    @property
    def pk(self):
        return self.endpoint.pk

    @property
    def id(self):
        return self.endpoint.id

    def __str__(self):
        return f"Agent: {self.endpoint.agent_id}"


def get_endpoint_from_request(request) -> AgentEndpoint:
    """
    Helper to get the authenticated endpoint from a request.
    Raises ValueError if not authenticated via API key.
    """
    if hasattr(request, 'user') and isinstance(request.user, ZentinelleAgentUser):
        return request.user.endpoint
    raise ValueError("Request not authenticated with Zentinelle API key")


def get_tenant_id_from_request(request):
    """
    Helper to get tenant_id from request.
    Works with API key auth (agent) and session auth (admin).
    """
    # Agent API key auth
    if hasattr(request, 'user') and isinstance(request.user, ZentinelleAgentUser):
        return request.user.tenant_id

    return None


# Backward-compatible alias
get_organization_from_request = get_tenant_id_from_request


class ZentinelleCombinedAuthentication(authentication.BaseAuthentication):
    """
    Authentication that accepts agent (sk_agent_) keys.

    In standalone mode, deployment keys are not supported directly.
    """

    keyword = 'X-Zentinelle-Key'

    def authenticate(self, request):
        api_key = request.META.get('HTTP_X_ZENTINELLE_KEY', '')

        if not api_key:
            return None

        # Try agent key
        if api_key.startswith('sk_agent_'):
            return ZentinelleAPIKeyAuthentication().authenticate(request)

        raise exceptions.AuthenticationFailed('Invalid API key format')

    def authenticate_header(self, request):
        return self.keyword
