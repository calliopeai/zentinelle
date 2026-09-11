"""
Agent registration endpoint.
POST /api/zentinelle/v1/register

Authentication:
- Requires a valid bootstrap token in the X-Zentinelle-Bootstrap header
- Bootstrap tokens are issued per-tenant and are used to register new agents
- After registration, agents use their API key for subsequent requests
"""
import hashlib
import hmac
import logging
import uuid

from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.serializers import RegisterRequestSerializer
from zentinelle.models import AgentEndpoint, TenantConfig

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

        if not bootstrap_token or not bootstrap_token.startswith('bt_'):
            return False

        # Try database-issued tokens first
        from zentinelle.models.bootstrap_token import BootstrapToken
        tenant_id, record = BootstrapToken.validate(bootstrap_token)
        if tenant_id:
            request._zentinelle_tenant_id = tenant_id
            return True

        # Fall back to HMAC validation (simple deployments)
        return self._validate_hmac(request, bootstrap_token)

    @staticmethod
    def _validate_hmac(request, bootstrap_token):
        import os
        try:
            parts = bootstrap_token.split('_', 2)
            if len(parts) != 3:
                return False

            _, tenant_id, provided_sig = parts
            if not tenant_id:
                return False

            secret = os.environ.get('ZENTINELLE_BOOTSTRAP_SECRET', '')
            if not secret:
                logger.warning(
                    'ZENTINELLE_BOOTSTRAP_SECRET not set; bootstrap registration disabled'
                )
                return False

            expected_sig = hmac.new(
                secret.encode(),
                tenant_id.encode(),
                hashlib.sha256,
            ).hexdigest()

            if not hmac.compare_digest(expected_sig, provided_sig):
                logger.warning(f'Bootstrap token signature mismatch for tenant: {tenant_id}')
                return False

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

        from zentinelle.services.agent_taxonomy import inherit_taxonomy, validate_taxonomy
        metadata = dict(data.get('metadata') or {})
        tenant_config = TenantConfig.objects.filter(tenant_id=tenant_id).first()
        extensions = (tenant_config.settings or {}).get('taxonomy_extensions', []) if tenant_config else []
        taxonomy = validate_taxonomy(metadata.get('taxonomy', []), tenant_extensions=extensions)
        parent_id = metadata.get('parent_agent_id')
        if parent_id:
            parent = AgentEndpoint.objects.filter(tenant_id=tenant_id, agent_id=str(parent_id)).first()
            if parent is None:
                return Response({'error': 'parent_agent_id is not registered in this tenant'}, status=400)
            try:
                taxonomy = inherit_taxonomy(parent.metadata.get('taxonomy', {}), taxonomy)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=400)
        metadata['taxonomy'] = taxonomy

        # Generate agent_id if not provided
        agent_id = data.get('agent_id')
        if not agent_id:
            agent_type = data['agent_type']
            suffix = uuid.uuid4().hex[:8]
            agent_id = slugify(f"{agent_type}-{suffix}")

        # agent_id is unique per tenant, not globally: the model constrains
        # ('tenant_id', 'agent_id'). Looking it up unscoped let one tenant's
        # slug block another's, and the 409 disclosed that the slug was taken
        # in an account the caller cannot see.
        existing = AgentEndpoint.objects.filter(
            tenant_id=tenant_id, agent_id=agent_id
        ).first()

        # Generate API key. Registration is the only time the plaintext exists,
        # so a re-register has to mint a fresh one for the caller to use.
        api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        if existing is not None:
            # Idempotent re-register. Astrolift sets agent_id to the deployment
            # slug, and a redeploy reuses that slug, so this has to update the
            # existing identity rather than fail. Config is left alone: it may
            # have been tuned since the first registration.
            existing.name = data.get('name', existing.name)
            existing.agent_type = data['agent_type']
            existing.api_key_hash = key_hash
            existing.api_key_prefix = key_prefix
            existing.capabilities = data.get('capabilities', existing.capabilities)
            existing.metadata = metadata
            existing.status = AgentEndpoint.Status.ACTIVE
            existing.health = AgentEndpoint.Health.UNKNOWN
            existing.save()

            endpoint = existing
            created = False
            logger.info(f"Re-registered agent: {agent_id} for tenant {tenant_id}")
        else:
            endpoint = AgentEndpoint.objects.create(
                tenant_id=tenant_id,
                agent_id=agent_id,
                name=data.get('name', agent_id),
                agent_type=data['agent_type'],
                api_key_hash=key_hash,
                api_key_prefix=key_prefix,
                capabilities=data.get('capabilities', []),
                metadata=metadata,
                status=AgentEndpoint.Status.ACTIVE,
                health=AgentEndpoint.Health.UNKNOWN,
                config=self._get_default_config(),
            )
            created = True
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

        return Response(
            response_data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def _get_default_config(self) -> dict:
        """Default configuration for new agents."""
        return {
            'heartbeat_interval_seconds': 60,
            'event_batch_size': 100,
            'event_flush_interval_seconds': 5,
            'config_refresh_interval_seconds': 300,
        }
