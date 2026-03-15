"""
Custom GraphQL view with standalone auth support.

In DEBUG mode, requests with `Authorization: Session standalone-dev` are
authenticated as a lightweight in-memory dev user with superuser privileges.
This allows the frontend to work without Auth0 locally.
"""
import os
import logging
from graphene_django.views import GraphQLView

logger = logging.getLogger(__name__)


class _StandaloneDevUser:
    """
    Minimal in-memory user object that satisfies auth_helpers checks.
    No database required — used only in DEBUG mode with standalone-dev token.
    """
    is_authenticated = True
    is_active = True
    is_staff = True
    is_superuser = True
    pk = 0
    id = 0
    username = "standalone-dev"

    def __str__(self):
        return "standalone-dev"


_DEV_USER = _StandaloneDevUser()


class ZentinelleGraphQLView(GraphQLView):
    """
    GraphQL view that understands Authorization: Session <key> headers.

    In DEBUG mode, any Session token authenticates as a dev superuser so
    filter_by_org returns real data.
    """

    def dispatch(self, request, *args, **kwargs):
        self._maybe_auth_standalone(request)
        response = super().dispatch(request, *args, **kwargs)
        if response.status_code == 400:
            import json
            try:
                body = json.loads(request.body.decode())
                query = body.get('query', '')[:200]
            except Exception:
                query = '<unreadable>'
            logger.warning("[GraphQL] 400 from query: %s", query)
        return response

    def _maybe_auth_standalone(self, request):
        debug = os.environ.get("DEBUG", "False").lower() in ("1", "true", "yes")
        if not debug:
            return

        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Session "):
            return

        session_key = auth_header[8:].strip()
        if not session_key:
            return

        # Already authenticated via Django session cookie — don't override.
        if getattr(request.user, "is_authenticated", False):
            return

        request.user = _DEV_USER
        logger.debug("[GraphQL] Standalone dev auth: authenticated as dev superuser")
