"""Bind hub-host decisions to a freshly verified JupyterHub user (#415)."""
from urllib.parse import urlsplit

import httpx
from rest_framework.exceptions import AuthenticationFailed


def verified_hub_identity(endpoint, request):
    binding = (endpoint.config or {}).get('hub_identity')
    token = request.META.get('HTTP_X_JUPYTERHUB_USER_TOKEN', '')
    if not binding:
        if token:
            raise AuthenticationFailed('Hub identity is not configured for this endpoint')
        return None
    if not isinstance(binding, dict) or not token or len(token) > 4096:
        raise AuthenticationFailed('A verified hub user token is required')
    api_url, hub_id = binding.get('api_url', ''), binding.get('hub_id', '')
    parsed = urlsplit(api_url)
    if (parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or not isinstance(hub_id, str) or not hub_id or len(hub_id) > 64):
        raise AuthenticationFailed('Hub identity configuration is invalid')
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
