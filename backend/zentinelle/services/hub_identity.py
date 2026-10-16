"""Bind hub-host decisions to a freshly verified JupyterHub user (#415)."""
import ipaddress
import socket
from urllib.parse import urlsplit

import httpx
from django.conf import settings
from rest_framework.exceptions import AuthenticationFailed


def hub_identity_error(binding):
    """Why `binding` (an endpoint's config.hub_identity) is unusable, or None.

    The backend calls `api_url` on every request the endpoint makes, so the
    URL is a server-side request an operator chooses (T13). It must name a
    host in HUB_IDENTITY_ALLOWED_HOSTS, or one that resolves only to public
    addresses: never loopback, link-local (cloud metadata), private or
    reserved ones the backend can reach and the operator cannot.
    """
    if not isinstance(binding, dict):
        return 'hub_identity must be an object'
    api_url, hub_id = binding.get('api_url', ''), binding.get('hub_id', '')
    parsed = urlsplit(api_url if isinstance(api_url, str) else '')
    try:
        port = parsed.port
    except ValueError:
        return 'hub_identity.api_url has an invalid port'
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment):
        return 'hub_identity.api_url must be a plain http(s) URL'
    if not isinstance(hub_id, str) or not hub_id or len(hub_id) > 64:
        return 'hub_identity.hub_id must be 1 to 64 characters'
    host = parsed.hostname.lower()
    if host in settings.HUB_IDENTITY_ALLOWED_HOSTS:
        return None
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(
            host, port or (443 if parsed.scheme == 'https' else 80), proto=socket.IPPROTO_TCP)}
    except (OSError, UnicodeError):
        return 'hub_identity.api_url host does not resolve'
    if not addresses or not all(ipaddress.ip_address(a.split('%')[0]).is_global for a in addresses):
        return ('hub_identity.api_url resolves to a non-public address; '
                'add its host to HUB_IDENTITY_ALLOWED_HOSTS')
    return None


def verified_hub_identity(endpoint, request):
    binding = (endpoint.config or {}).get('hub_identity')
    token = request.META.get('HTTP_X_JUPYTERHUB_USER_TOKEN', '')
    if not binding:
        if token:
            raise AuthenticationFailed('Hub identity is not configured for this endpoint')
        return None
    if not isinstance(binding, dict) or not token or len(token) > 4096:
        raise AuthenticationFailed('A verified hub user token is required')
    if hub_identity_error(binding):
        raise AuthenticationFailed('Hub identity configuration is invalid')
    api_url, hub_id = binding['api_url'], binding['hub_id']
    try:
        # The URL is endpoint-admin configuration, never supplied by the caller.
        # No redirects, token cache, or fallback to a caller-claimed user ID.
        response = httpx.get(api_url.rstrip('/') + '/user',
                             headers={'Authorization': 'token ' + token},
                             timeout=5, follow_redirects=False)
        if response.status_code != 200 or len(response.content) > 65536:
            raise ValueError('Hub refused identity')
        user = response.json()
        name, scopes = user.get('name'), user.get('scopes', [])
        if (user.get('kind') != 'user' or not isinstance(name, str)
                or not name or len(name) > 128 or not isinstance(scopes, list)):
            raise ValueError('Not a hub user')
        own_server = 'access:servers!server=' + name + '/'
        if not any(isinstance(scope, str) and (scope in (
                'access:servers', 'access:servers!user=' + name)
                or scope.startswith(own_server)) for scope in scopes):
            raise ValueError('No user server access')
    except (httpx.HTTPError, ValueError, TypeError, AttributeError):
        raise AuthenticationFailed('Hub user identity could not be verified') from None
    return {'user_id': f'hub:{hub_id}:{name}', 'hub_id': hub_id, 'hub_user': name}
