"""
Agent registration endpoint.
POST /api/zentinelle/v1/register

Authentication:
- Requires a valid bootstrap token in the X-Zentinelle-Bootstrap header
- Bootstrap tokens are issued per-tenant and are used to register new agents
- After registration, agents use their API key for subsequent requests
"""
import uuid
import logging
import hashlib
import hmac

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import BasePermission
from django.utils.text import slugify
from django.conf import settings

from zentinelle.models import AgentEndpoint, ZentinelleLicense
from zentinelle.api.serializers import RegisterRequestSerializer, RegisterResponseSerializer

logger = logging.getLogger(__name__)


class BootstrapTokenPermission(BasePermission):
    """
    Permission class that validates bootstrap tokens for agent registration.

    In standalone mode, bootstrap tokens are validated against
    the ZentinelleLicense table.

    Required header: X-Zentinelle-Bootstrap: <bootstrap_token>
    """

    message = 'Invalid or missing bootstrap token.'

    def has_permission(self, request, view):
        bootstrap_token = request.META.get('HTTP_X_ZENTINELLE_BOOTSTRAP', '')

        if not bootstrap_token:
            return False

        # Bootstrap token format: bt_<tenant_id>_<secret>
        if not bootstrap_token.startswith('bt_'):
            return False

        try:
            parts = bootstrap_token.split('_', 2)
            if len(parts) != 3:
                return False

            _, tenant_id, secret = parts

            # Hash the provided token and compare against known hashes
            # TODO: decouple - implement standalone bootstrap token verification
            # For now, store the tenant_id on the request
            request._zentinelle_tenant_id = tenant_id
            return True

        except (ValueError, IndexError):
            return False


class RegisterView(APIView):
    """
    Register a new agent endpoint.

    This is called by agents on startup to register themselves.
    Returns an API key that must be used for subsequent requests.
    """

    permission_classes = [BootstrapTokenPermission]

    def post(self, request):
        serializer = RegisterRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get tenant_id from the authenticated bootstrap token
        tenant_id = getattr(request, '_zentinelle_tenant_id', None)
        if not tenant_id:
            return Response(
                {'error': 'Invalid bootstrap token'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Generate agent_id if not provided
        agent_id = data.get('agent_id')
        if not agent_id:
            agent_type = data['agent_type']
            suffix = uuid.uuid4().hex[:8]
            agent_id = slugify(f"{agent_type}-{suffix}")

        # Check if agent_id already exists
        if AgentEndpoint.objects.filter(agent_id=agent_id).exists():
            return Response(
                {'error': f'Agent ID "{agent_id}" already exists'},
                status=status.HTTP_409_CONFLICT
            )

        # Generate API key
        api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        # Create endpoint
        endpoint = AgentEndpoint.objects.create(
            tenant_id=tenant_id,
            agent_id=agent_id,
            name=data.get('name', agent_id),
            agent_type=data['agent_type'],
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            capabilities=data.get('capabilities', []),
            metadata=data.get('metadata', {}),
            status=AgentEndpoint.Status.ACTIVE,
            health=AgentEndpoint.Health.UNKNOWN,
            config=self._get_default_config(),
        )

        logger.info(f"Registered new agent: {agent_id} for tenant {tenant_id}")

        # Get effective policies for this endpoint
        from zentinelle.services.policy_engine import PolicyEngine
        engine = PolicyEngine()
        policies = engine.get_effective_policies(endpoint)

        response_data = {
            'agent_id': endpoint.agent_id,
            'api_key': api_key,  # Only time this is returned!
            'config': endpoint.config,
            'policies': [
                {
                    'id': str(p.id),
                    'name': p.name,
                    'type': p.policy_type,
                    'enforcement': p.enforcement,
                    'config': p.config,
                }
                for p in policies
            ],
        }

        return Response(response_data, status=status.HTTP_201_CREATED)

    def _get_default_config(self) -> dict:
        """Default configuration for new agents."""
        return {
            'heartbeat_interval_seconds': 60,
            'event_batch_size': 100,
            'event_flush_interval_seconds': 5,
            'config_refresh_interval_seconds': 300,
        }
