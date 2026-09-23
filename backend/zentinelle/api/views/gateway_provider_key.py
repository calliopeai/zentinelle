"""
Provider key lookup for the Go gateway (#380).

POST /api/zentinelle/v1/gateway/provider-key
    X-Zentinelle-Gateway-Credential: sk_gateway_...
    X-Zentinelle-Key: sk_agent_...
    {"provider": "anthropic"}

The gateway holds an agent key, not a database, so it cannot read the
per-tenant LLMProviderKey itself. It asks here once the request's policy check
has passed, caches the answer for a minute, and injects the key upstream. One
gateway can then serve each tenant on that tenant's own provider account, and
no agent ever holds a provider key.

Each gateway is registered with the tenants it serves (GatewayRegistration),
and a key is released only when the agent's tenant is one of them. A leaked
gateway credential exposes that gateway's tenants and no others.

This is the only endpoint that returns a raw provider key, and it is separate
from /evaluate on purpose. A decision is made per request and is never cached,
while a key is stable and can be. The evaluate response is also the most widely
read and logged payload in the system, and a secret does not belong in it.
"""
import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from zentinelle.api.auth import (GatewayAgentAuthentication,
                                 get_endpoint_from_request)
from zentinelle.api.serializers import GatewayProviderKeyRequestSerializer
from zentinelle.models import AuditLog, GatewayCredential, LLMProviderKey

logger = logging.getLogger(__name__)


def _no_store(response):
    """Keep a provider key out of every cache between the gateway and here."""
    response['Cache-Control'] = 'no-store'
    return response


class GatewayProviderKeyView(APIView):
    """Return the authenticated agent's tenant's stored key for one provider."""

    authentication_classes = [GatewayAgentAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = GatewayProviderKeyRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        provider = serializer.validated_data['provider']

        # The tenant comes from the authenticated agent key and nothing else,
        # and must be one this gateway is registered for.
        endpoint = get_endpoint_from_request(request)
        tenant_id = endpoint.tenant_id
        credential = request.auth
        registration = credential.registration
        if not registration.serves(tenant_id):
            logger.warning('Gateway %s asked for the %s key of tenant %s, which it is not registered for',
                           registration.name, provider, tenant_id)
            return _no_store(Response(
                {'error': 'tenant_not_in_gateway_scope',
                 'detail': "This gateway is not registered for the agent's tenant"},
                status=status.HTTP_403_FORBIDDEN,
            ))

        record = LLMProviderKey.objects.filter(
            tenant_id=tenant_id, provider=provider, is_active=True,
        ).first()
        # A row without ciphertext is the placeholder the settings page keeps
        # for a keyless local provider's toggle. It holds no key.
        if record is None or not record.encrypted_key:
            return _no_store(Response(
                {'error': 'provider_key_not_found',
                 'detail': f'No {provider} key is stored for this tenant'},
                status=status.HTTP_404_NOT_FOUND,
            ))

        api_key = record.get_key()
        if not api_key:
            # A key exists but cannot be read, most likely because
            # ZENTINELLE_SECRET_KEY changed after it was stored. This is not a
            # 404: on a 404 the gateway may fall back to its own env key, and
            # serving this tenant on some other account's key is no recovery.
            logger.error('Stored %s key for tenant %s cannot be decrypted', provider, tenant_id)
            return _no_store(Response(
                {'error': 'provider_key_unreadable',
                 'detail': f'The stored {provider} key cannot be decrypted'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            ))

        # Recorded before the key is released, so a disclosure that cannot be
        # audited does not happen. Which key, to which gateway for which
        # agent, never the value.
        metadata = {'reader': 'gateway', 'gateway': registration.name,
                    'gateway_id': str(registration.id), 'agent_id': endpoint.agent_id}
        if registration.cluster_id:
            metadata['cluster_id'] = registration.cluster_id
        AuditLog.log_from_request(
            request, tenant_id,
            action=AuditLog.Action.ACCESS,
            resource_type='llm_provider_key',
            resource_id=provider,
            metadata=metadata,
        )
        now = timezone.now()
        LLMProviderKey.objects.filter(pk=record.pk, tenant_id=tenant_id).update(last_used_at=now)
        GatewayCredential.objects.filter(pk=credential.pk).update(last_used_at=now)
        logger.info('Released stored %s key to gateway %s for agent %s (tenant %s)',
                    provider, registration.name, endpoint.agent_id, tenant_id)

        return _no_store(Response({'provider': provider, 'api_key': api_key}))
