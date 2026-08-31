"""
API Key authentication for Zentinelle agent-facing endpoints.

Supports API keys:
- sk_agent_...   : AgentEndpoint keys (for spawned agents like labs/notebooks)
- sk_service_... : platform-level service keys, used by another Calliope
                   service (Astrolift) calling on behalf of a tenant

Note: Deployment key auth (sk_deploy_) has been removed in standalone mode.
Deployment operations are handled by the client-cove integration layer.
"""
from rest_framework import authentication, exceptions
from zentinelle.models import AgentEndpoint, APIKey
from zentinelle.utils.api_keys import KeyPrefixes


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


class ZentinelleServiceUser:
    """
    Principal for a platform-level service key.

    Carries a tenant_id but no AgentEndpoint: the caller is another service
    acting on behalf of a whole tenant, not one agent. Views must still scope
    every query by this tenant_id.
    """

    def __init__(self, api_key_record: APIKey):
        self.api_key = api_key_record
        self.tenant_id = api_key_record.tenant_id
        self.scopes = api_key_record.scopes or []
        self.is_authenticated = True
        self.is_active = api_key_record.is_active

    @property
    def pk(self):
        return self.api_key.pk

    @property
    def id(self):
        return self.api_key.id

    def has_scope(self, scope: str) -> bool:
        return scope in self.scopes

    def __str__(self):
        return f"Service: {self.api_key.name}"


class ZentinelleServiceKeyAuthentication(authentication.BaseAuthentication):
    """
    Authenticate a platform-level service key.

    Usage:
        Authorization: Bearer sk_service_...

    Only keys with key_type=SERVICE authenticate here. A user key presented on
    this header is rejected rather than silently upgraded.
    """

    keyword = 'Bearer'

    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.startswith('Bearer '):
            return None

        api_key = header[len('Bearer '):].strip()
        if not api_key.startswith(KeyPrefixes.SERVICE):
            # Not a service key. Let another authenticator handle it.
            return None

        key_prefix = api_key[:15]

        try:
            record = APIKey.objects.get(
                key_prefix=key_prefix,
                key_type=APIKey.KeyType.SERVICE,
            )
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid service key')
        except APIKey.MultipleObjectsReturned:
            raise exceptions.AuthenticationFailed('Invalid service key')

        if not APIKey.verify_api_key(api_key, record.key_hash):
            raise exceptions.AuthenticationFailed('Invalid service key')

        # is_active covers both revocation and expiry.
        if not record.is_active:
            raise exceptions.AuthenticationFailed('Service key is not active')

        if not record.tenant_id:
            raise exceptions.AuthenticationFailed('Service key has no tenant')

        record.record_usage()

        return (ZentinelleServiceUser(record), api_key)

    def authenticate_header(self, request):
        return self.keyword


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
    Works with API key auth (agent), session auth (admin), and open mode.
    """
    import os

    # Agent API key auth
    if hasattr(request, 'user') and isinstance(request.user, ZentinelleAgentUser):
        return request.user.tenant_id

    # Service key auth — another Calliope service acting for a tenant
    if hasattr(request, 'user') and isinstance(request.user, ZentinelleServiceUser):
        return request.user.tenant_id

    # Session/portal auth — single-tenant standalone deployment
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return '00000000-0000-0000-0000-000000000001'

    # Open mode — even anonymous users get the standalone tenant
    if os.environ.get('AUTH_MODE', 'open').lower() == 'open':
        return '00000000-0000-0000-0000-000000000001'

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
