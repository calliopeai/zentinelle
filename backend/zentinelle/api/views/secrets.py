"""
Agent secrets endpoint.
GET /api/zentinelle/v1/secrets
GET /api/zentinelle/v1/secrets/{agent_id}

Standalone mode does not yet provision agent-scoped secret bundles directly in
this repo, so the endpoint currently returns an empty payload when no secrets
are available for the authenticated agent.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request


class SecretsView(APIView):
    """
    Return scoped secrets for the authenticated agent.

    The authenticated API key determines which agent may access this endpoint.
    An optional ``agent_id`` path segment is accepted for compatibility with SDKs
    that address config and secrets by agent identifier.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, agent_id: str = None):
        auth_endpoint = get_endpoint_from_request(request)
        requested_agent_id = agent_id or auth_endpoint.agent_id

        if auth_endpoint.agent_id != requested_agent_id:
            return Response(
                {'error': 'Not authorized to access this endpoint secrets'},
                status=status.HTTP_403_FORBIDDEN,
            )

        response_data = {
            'secrets': {},
            'providers': {},
            'expires_at': (timezone.now() + timedelta(seconds=60)).isoformat(),
        }
        return Response(response_data, status=status.HTTP_200_OK)
