"""
Shared permission and authentication helpers for portal-and-agent endpoints.

Some endpoints (audit verify, audit export, compliance reports, retention
status, etc.) need to be callable from BOTH:
  - The portal (session cookie auth, or open mode)
  - Agent SDKs (X-Zentinelle-Key API key auth)

Use OpenOrAgentAuth for those endpoints.
"""
import os

from rest_framework import authentication
from rest_framework.permissions import BasePermission

from zentinelle.api.auth import ZentinelleAPIKeyAuthentication


class _OpenModeUser:
    """In-memory admin user for open auth mode."""
    is_authenticated = True
    is_active = True
    is_staff = True
    is_superuser = True
    pk = 0
    id = 0
    username = "admin"

    def __str__(self):
        return "admin"

    class _groups:
        @staticmethod
        def values_list(*args, **kwargs):
            return []

    groups = _groups()


_OPEN_USER = _OpenModeUser()


class OpenModeAuthentication(authentication.BaseAuthentication):
    """
    If AUTH_MODE=open, authenticate everyone as an admin user.
    Returns None (skip) otherwise so the next auth class can handle it.
    """

    def authenticate(self, request):
        if os.environ.get('AUTH_MODE', 'open').lower() == 'open':
            return (_OPEN_USER, None)
        return None


class OpenOrAgentAuth(BasePermission):
    """
    Permission that accepts:
      - Open auth mode (everyone is admin)
      - Authenticated portal session (Django user)
      - Agent API key auth (ZentinelleAgentUser)
    """

    def has_permission(self, request, view):
        if os.environ.get('AUTH_MODE', 'open').lower() == 'open':
            return True
        return bool(request.user and request.user.is_authenticated)


# Convenience: list of authentication classes for portal-AND-agent endpoints
PORTAL_OR_AGENT_AUTH = [
    OpenModeAuthentication,
    ZentinelleAPIKeyAuthentication,
    authentication.SessionAuthentication,
]
