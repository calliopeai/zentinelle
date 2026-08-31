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
from zentinelle.auth.mode import is_open_mode


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
        if is_open_mode():
            return (_OPEN_USER, None)
        return None

    def authenticate_header(self, request):
        """The challenge for a request that arrived with no credentials.

        DRF asks the *first* authenticator in the list for this, and answers
        403 when it gets nothing back and 401 when it gets a challenge. This
        class is first, so without this an unauthenticated request to an
        enforcing deployment was told "forbidden" — which reads as "your
        credentials do not permit this" — when the truth was that it presented
        none. The header names how to present them.
        """
        return 'X-Zentinelle-Key'


class OpenOrAgentAuth(BasePermission):
    """
    Permission that accepts:
      - Open auth mode (everyone is admin)
      - Authenticated portal session (Django user)
      - Agent API key auth (ZentinelleAgentUser)
    """

    def has_permission(self, request, view):
        if is_open_mode():
            return True
        return bool(request.user and request.user.is_authenticated)


# Convenience: list of authentication classes for portal-AND-agent endpoints
PORTAL_OR_AGENT_AUTH = [
    OpenModeAuthentication,
    ZentinelleAPIKeyAuthentication,
    authentication.SessionAuthentication,
]


class IsServiceKey(BasePermission):
    """
    Require a platform-level service key.

    Deliberately does NOT honour AUTH_MODE=open. Service endpoints are the
    machine-to-machine surface between Calliope services and are tenant-scoped
    by the key itself, so there is no meaningful "open" version of them: with
    no key there is no tenant, and a view that cannot name its tenant must not
    return rows.
    """

    def has_permission(self, request, view):
        from zentinelle.api.auth import ZentinelleServiceUser

        user = getattr(request, 'user', None)
        return isinstance(user, ZentinelleServiceUser) and user.is_active
