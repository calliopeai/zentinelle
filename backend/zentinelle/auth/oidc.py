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
import base64
import hashlib
import logging
import os
import secrets
import time
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
        'expected_tenant': os.environ.get('OIDC_EXPECTED_TENANT', ''),
        'post_login_url': os.environ.get('OIDC_POST_LOGIN_URL', '/'),
    }


def _cached_document(url: str, refresh: bool = False) -> dict:
    cached = _discovery_cache.get(url)
    if not refresh and cached and cached[0] > time.monotonic():
        return cached[1]
    response = httpx.get(url, timeout=10.0)
    response.raise_for_status()
    data = response.json()
    _discovery_cache[url] = (time.monotonic() + 300, data)
    return data


def _discover(discovery_url: str) -> dict:
    return _cached_document(discovery_url)


def _get_jwks(jwks_uri: str, refresh: bool = False) -> dict:
    return _cached_document(jwks_uri, refresh=refresh)


class OIDCLoginView(View):
    """Redirect to the OIDC provider's authorization endpoint."""

    def get(self, request):
        config = _get_config()
        if not config['discovery_url'] or not config['client_id']:
            return JsonResponse({'error': 'OIDC not configured'}, status=501)

        discovery = _discover(config['discovery_url'])
        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        verifier = secrets.token_urlsafe(64)
        request.session['oidc_verifier'] = verifier
        request.session['oidc_started_at'] = time.time()

        request.session['oidc_state'] = state
        request.session['oidc_nonce'] = nonce

        params = {
            'response_type': 'code',
            'client_id': config['client_id'],
            'redirect_uri': config['redirect_uri'],
            'scope': config['scopes'],
            'state': state,
            'nonce': nonce,
            'code_challenge_method': 'S256',
            'code_challenge': base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode(),
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

        expected_state = request.session.pop('oidc_state', '')
        expected_nonce = request.session.pop('oidc_nonce', '')
        verifier = request.session.pop('oidc_verifier', '')
        started = request.session.pop('oidc_started_at', 0)
        if (not code or not state or not expected_state or not verifier
                or not secrets.compare_digest(state, expected_state)
                or time.time() - started > 600):
            return JsonResponse({'error': 'Invalid state parameter'}, status=400)

        discovery = _discover(config['discovery_url'])

        token_resp = httpx.post(
            discovery['token_endpoint'],
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'code_verifier': verifier,
                'redirect_uri': config['redirect_uri'],
                'client_id': config['client_id'],
                'client_secret': config['client_secret'],
            },
            timeout=10.0,
        )

        if token_resp.status_code != 200:
            logger.warning('OIDC token exchange failed with status %s', token_resp.status_code)
            return JsonResponse({'error': 'Token exchange failed'}, status=400)

        tokens = token_resp.json()
        id_token = tokens.get('id_token', '')

        try:
            claims = self._validate_id_token(id_token, config, discovery)
        except Exception as e:
            logger.warning('OIDC token validation failed: %s', e)
            return JsonResponse({'error': 'Token validation failed'}, status=400)

        nonce = claims.get('nonce', '')
        if not expected_nonce or not isinstance(nonce, str) or not secrets.compare_digest(nonce, expected_nonce):
            return JsonResponse({'error': 'Nonce mismatch'}, status=400)

        try:
            user = self._provision_user(claims, config)
        except ValueError:
            return JsonResponse({'error': 'Identity is not authorized for this deployment'}, status=403)
        if not user.is_active:
            return JsonResponse({'error': 'Account is disabled'}, status=403)
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
            for k in _get_jwks(discovery['jwks_uri'], refresh=True).get('keys', []):
                if k.get('kid') == kid:
                    key = jwt.algorithms.RSAAlgorithm.from_jwk(k)
                    break
        if key is None:
            raise ValueError(f'No matching JWK for kid={kid}')

        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=['RS256'],
            audience=config['client_id'],
            issuer=discovery['issuer'],
            options={'require': ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce']},
        )
        if isinstance(claims['aud'], list) and len(claims['aud']) > 1:
            if claims.get('azp') != config['client_id']:
                raise ValueError('Invalid authorized party')
        if not isinstance(claims['sub'], str) or not claims['sub']:
            raise ValueError('Missing subject')
        return claims

    def _provision_user(self, claims: dict, config: dict):
        from zentinelle.auth.roles import (ROLE_ADMIN, ROLE_OPERATOR,
                                           ROLE_VIEWER, assign_role)

        email = claims.get('email', '')
        sub = claims.get('sub', '')

        # Extract tenant and role from claims using configured claim names
        tenant_id = claims.get(config['tenant_claim'], '')
        role = claims.get(config['role_claim'], '')
        if not isinstance(role, str):
            role = ''

        issuer = claims.get('iss', '')
        if not issuer or not sub:
            raise ValueError('Issuer and subject are required')
        if tenant_id and not config.get('expected_tenant'):
            raise ValueError('Configure OIDC_EXPECTED_TENANT before accepting tenant-bearing identities')
        if config.get('expected_tenant') and tenant_id != config['expected_tenant']:
            raise ValueError('Tenant is not authorized')
        is_admin = role == 'admin'

        # Email is a profile attribute, never an account-linking credential.
        username = 'oidc_' + hashlib.sha256((issuer + '\0' + sub).encode()).hexdigest()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'first_name': claims.get('given_name', ''),
                'last_name': claims.get('family_name', ''),
                'is_staff': is_admin,
                'is_active': True,
            },
        )

        if not created:
            user.email = email
            user.first_name = claims.get('given_name', user.first_name)
            user.last_name = claims.get('family_name', user.last_name)
            user.is_staff = is_admin
            user.is_superuser = False
            user.save(update_fields=['email', 'first_name', 'last_name', 'is_staff', 'is_superuser'])

        # Assign Zentinelle RBAC role based on OIDC claim
        role_map = {'admin': ROLE_ADMIN, 'operator': ROLE_OPERATOR, 'viewer': ROLE_VIEWER}
        assign_role(user, role_map.get(role, ROLE_VIEWER))
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])

        if created:
            logger.info('OIDC: provisioned new user %s (tenant=%s, role=%s)', username, tenant_id, role)

        return user
