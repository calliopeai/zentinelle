"""
Lightweight OIDC client for standalone Zentinelle deployments.

Implements the Authorization Code flow:
1. /api/zentinelle/v1/auth/oidc/login  → redirect to provider
2. /api/zentinelle/v1/auth/oidc/callback → exchange code, create session

Supports any OIDC-compliant provider (Okta, Entra ID, Keycloak, Auth0, Google).

Required env vars:
    OIDC_DISCOVERY_URL  — e.g. https://accounts.google.com/.well-known/openid-configuration
    OIDC_CLIENT_ID
    OIDC_CLIENT_SECRET
    OIDC_REDIRECT_URI   — e.g. https://zentinelle.example.com/api/zentinelle/v1/auth/oidc/callback

Optional:
    OIDC_SCOPES         — space-separated (default: "openid email profile")
    OIDC_TENANT_CLAIM   — claim that maps to tenant_id (default: "org_id")
    OIDC_ROLE_CLAIM     — claim that maps to role (default: "role")
    OIDC_POST_LOGIN_URL — where to redirect after login (default: "/")
"""
import logging
import os
import secrets
from urllib.parse import urlencode

import httpx
import jwt
from django.contrib.auth import get_user_model, login
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views import View

logger = logging.getLogger(__name__)
User = get_user_model()

_discovery_cache = {}


def _get_config():
    return {
        'discovery_url': os.environ.get('OIDC_DISCOVERY_URL', ''),
        'client_id': os.environ.get('OIDC_CLIENT_ID', ''),
        'client_secret': os.environ.get('OIDC_CLIENT_SECRET', ''),
        'redirect_uri': os.environ.get('OIDC_REDIRECT_URI', ''),
        'scopes': os.environ.get('OIDC_SCOPES', 'openid email profile'),
        'tenant_claim': os.environ.get('OIDC_TENANT_CLAIM', 'org_id'),
        'role_claim': os.environ.get('OIDC_ROLE_CLAIM', 'role'),
        'post_login_url': os.environ.get('OIDC_POST_LOGIN_URL', '/'),
    }


def _discover(discovery_url: str) -> dict:
    if discovery_url in _discovery_cache:
        return _discovery_cache[discovery_url]

    resp = httpx.get(discovery_url, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    _discovery_cache[discovery_url] = data
    return data


def _get_jwks(jwks_uri: str) -> dict:
    cache_key = f'jwks:{jwks_uri}'
    if cache_key in _discovery_cache:
        return _discovery_cache[cache_key]

    resp = httpx.get(jwks_uri, timeout=10.0)
    resp.raise_for_status()
    data = resp.json()
    _discovery_cache[cache_key] = data
    return data


class OIDCLoginView(View):
    """Redirect to the OIDC provider's authorization endpoint."""

    def get(self, request):
        config = _get_config()
        if not config['discovery_url'] or not config['client_id']:
            return JsonResponse({'error': 'OIDC not configured'}, status=501)

        discovery = _discover(config['discovery_url'])
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)

        request.session['oidc_state'] = state
        request.session['oidc_nonce'] = nonce

        params = {
            'response_type': 'code',
            'client_id': config['client_id'],
            'redirect_uri': config['redirect_uri'],
            'scope': config['scopes'],
            'state': state,
            'nonce': nonce,
        }

        auth_url = f"{discovery['authorization_endpoint']}?{urlencode(params)}"
        return redirect(auth_url)


class OIDCCallbackView(View):
    """Handle the OIDC callback: exchange code, validate token, create session."""

    def get(self, request):
        config = _get_config()
        error = request.GET.get('error')
        if error:
            return JsonResponse({'error': error, 'description': request.GET.get('error_description', '')}, status=400)

        code = request.GET.get('code', '')
        state = request.GET.get('state', '')

        if not code or state != request.session.get('oidc_state'):
            return JsonResponse({'error': 'Invalid state parameter'}, status=400)

        discovery = _discover(config['discovery_url'])

        token_resp = httpx.post(
            discovery['token_endpoint'],
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': config['redirect_uri'],
                'client_id': config['client_id'],
                'client_secret': config['client_secret'],
            },
            timeout=10.0,
        )

        if token_resp.status_code != 200:
            logger.warning('OIDC token exchange failed: %s', token_resp.text[:500])
            return JsonResponse({'error': 'Token exchange failed'}, status=400)

        tokens = token_resp.json()
        id_token = tokens.get('id_token', '')

        try:
            claims = self._validate_id_token(id_token, config, discovery)
        except Exception as e:
            logger.warning('OIDC token validation failed: %s', e)
            return JsonResponse({'error': 'Token validation failed'}, status=400)

        nonce = claims.get('nonce', '')
        if nonce != request.session.get('oidc_nonce'):
            return JsonResponse({'error': 'Nonce mismatch'}, status=400)

        user = self._provision_user(claims, config)
        login(request, user)

        request.session.pop('oidc_state', None)
        request.session.pop('oidc_nonce', None)

        return redirect(config['post_login_url'])

    def _validate_id_token(self, id_token: str, config: dict, discovery: dict) -> dict:
        jwks = _get_jwks(discovery['jwks_uri'])

        header = jwt.get_unverified_header(id_token)
        kid = header.get('kid')

        key = None
        for k in jwks.get('keys', []):
            if k.get('kid') == kid:
                key = jwt.algorithms.RSAAlgorithm.from_jwk(k)
                break

        if key is None:
            raise ValueError(f'No matching JWK for kid={kid}')

        return jwt.decode(
            id_token,
            key=key,
            algorithms=['RS256'],
            audience=config['client_id'],
            issuer=discovery.get('issuer'),
        )

    def _provision_user(self, claims: dict, config: dict):
        email = claims.get('email', '')
        sub = claims.get('sub', '')
        name = claims.get('name', email.split('@')[0] if email else sub)

        username = email or sub
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
                'is_staff': True,
                'is_active': True,
            },
        )

        if not created:
            user.email = email
            user.first_name = claims.get('given_name', user.first_name)
            user.last_name = claims.get('family_name', user.last_name)
            user.save(update_fields=['email', 'first_name', 'last_name'])

        if created:
            logger.info('OIDC: provisioned new user %s', username)

        return user
