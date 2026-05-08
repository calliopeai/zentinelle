"""
Custom GraphQL view with multi-mode auth support.

AUTH_MODE controls authentication:
  open  — all requests authenticated as admin (no login required)
  local — session cookie auth (login via /auth/login)
  sso   — session cookie from OIDC provider
"""
import os
import logging

from strawberry.django.views import GraphQLView

logger = logging.getLogger(__name__)


class _OpenModeUser:
    """Admin user for open mode — no auth required."""
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


class ZentinelleGraphQLView(GraphQLView):

    def dispatch(self, request, *args, **kwargs):
        self._apply_auth_mode(request)
        return super().dispatch(request, *args, **kwargs)

    def _apply_auth_mode(self, request):
        if getattr(request.user, 'is_authenticated', False):
            return

        auth_mode = os.environ.get('AUTH_MODE', 'open').lower()

        if auth_mode == 'open':
            request.user = _OPEN_USER
            return

        if auth_mode in ('local', 'standalone'):
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Session '):
                debug = os.environ.get('DEBUG', 'False').lower() in ('1', 'true', 'yes')
                if debug:
                    request.user = _OPEN_USER
