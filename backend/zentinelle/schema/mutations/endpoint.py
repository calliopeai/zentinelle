"""
AgentEndpoint-related GraphQL mutations.

Standalone version — uses tenant_id-based access instead of org membership.
"""
import logging
import uuid
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from graphql_relay import from_global_id

from zentinelle.models import AgentEndpoint
from zentinelle.schema.auth_helpers import get_request_tenant_id
from zentinelle.schema.types import AgentEndpointType

logger = logging.getLogger(__name__)


def resolve_endpoint_id(global_or_raw_id: str) -> str:
    """Decode a relay global ID to a raw UUID, or return the raw ID if already plain."""
    try:
        _type, raw_id = from_global_id(global_or_raw_id)
        if raw_id:
            return raw_id
    except Exception:
        pass
    return global_or_raw_id


@strawberry.input
class CreateAgentEndpointInput:
    name: str
    agent_id: Optional[str] = None
    agent_type: str
    tenant_id: Optional[str] = None
    capabilities: Optional[list[str]] = None
    metadata: Optional[JSON] = None
    config: Optional[JSON] = None


@strawberry.input
class UpdateAgentEndpointInput:
    id: strawberry.ID
    name: Optional[str] = None
    agent_type: Optional[str] = None
    capabilities: Optional[list[str]] = None
    metadata: Optional[JSON] = None
    config: Optional[JSON] = None


@strawberry.type
class CreateAgentEndpointPayload:
    endpoint: Optional[AgentEndpointType] = None
    api_key: Optional[str] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class UpdateAgentEndpointPayload:
    endpoint: Optional[AgentEndpointType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeleteAgentEndpointPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class SuspendAgentEndpointPayload:
    endpoint: Optional[AgentEndpointType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class ActivateAgentEndpointPayload:
    endpoint: Optional[AgentEndpointType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class RegenerateEndpointApiKeyPayload:
    success: Optional[bool] = None
    api_key: Optional[str] = None
    error: Optional[str] = None


@strawberry.type
class UpdateEndpointStatusPayload:
    endpoint: Optional[AgentEndpointType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


def create_agent_endpoint(info: strawberry.types.Info, organization_id: uuid.UUID, input: CreateAgentEndpointInput) -> CreateAgentEndpointPayload:
    if not info.context.request.user.is_authenticated:
        return CreateAgentEndpointPayload(success=False, error="Authentication required")

    valid_types = [t.value for t in AgentEndpoint.AgentType]
    if input.agent_type not in valid_types:
        return CreateAgentEndpointPayload(success=False, error=f"Invalid agent type: {input.agent_type}")

    try:
        api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        import secrets as secrets_module
        agent_id = input.agent_id
        if not agent_id:
            agent_id = f"{input.agent_type}-{secrets_module.token_hex(4)}"

        endpoint = AgentEndpoint.objects.create(
            tenant_id=str(organization_id),
            name=input.name,
            agent_id=agent_id,
            agent_type=input.agent_type,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            capabilities=input.capabilities or [],
            metadata=input.metadata or {},
            config=input.config or {},
            status=AgentEndpoint.Status.PROVISIONING,
        )

        return CreateAgentEndpointPayload(
            success=True,
            endpoint=endpoint,
            api_key=api_key
        )
    except Exception as e:
        logger.exception(f"Error creating agent endpoint: {e}")
        return CreateAgentEndpointPayload(success=False, error="Failed to create agent endpoint")


def _endpoint_for_caller(info, global_or_raw_id: str) -> AgentEndpoint:
    """The endpoint this caller is allowed to act on, or DoesNotExist.

    Every mutation here used `AgentEndpoint.objects.get(id=...)` with the id
    straight off the wire and no tenant constraint, behind a check that the
    caller was authenticated at all. Given another tenant's endpoint UUID, one
    could rename it, delete it, change its status — and, through
    `regenerate_endpoint_api_key`, be handed a working `sk_agent_` credential
    for it, which authenticates against every agent REST route and the LLM
    proxy. That is a tenant takeover reachable from a single unguessable-but-
    not-secret identifier.

    Raising DoesNotExist rather than a distinct "forbidden" is deliberate: a
    caller who may not see an endpoint should not learn that it exists.
    """
    tenant_id = get_request_tenant_id(info.context.request.user)
    if not tenant_id:
        raise AgentEndpoint.DoesNotExist()
    return AgentEndpoint.objects.get(
        id=resolve_endpoint_id(global_or_raw_id), tenant_id=str(tenant_id)
    )


def update_agent_endpoint(info: strawberry.types.Info, input: UpdateAgentEndpointInput) -> UpdateAgentEndpointPayload:
    if not info.context.request.user.is_authenticated:
        return UpdateAgentEndpointPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, input.id)
    except AgentEndpoint.DoesNotExist:
        return UpdateAgentEndpointPayload(success=False, error="Endpoint not found")

    if input.name:
        endpoint.name = input.name
    if input.agent_type:
        valid_types = [t.value for t in AgentEndpoint.AgentType]
        if input.agent_type not in valid_types:
            return UpdateAgentEndpointPayload(success=False, error=f"Invalid agent type: {input.agent_type}")
        endpoint.agent_type = input.agent_type
    if input.capabilities is not None:
        endpoint.capabilities = input.capabilities
    if input.metadata:
        endpoint.metadata = input.metadata
    if input.config:
        endpoint.config = input.config

    try:
        endpoint.save()
        return UpdateAgentEndpointPayload(success=True, endpoint=endpoint)
    except Exception as e:
        logger.exception(f"Error updating agent endpoint: {e}")
        return UpdateAgentEndpointPayload(success=False, error="Failed to update agent endpoint")


def delete_agent_endpoint(info: strawberry.types.Info, id: strawberry.ID) -> DeleteAgentEndpointPayload:
    if not info.context.request.user.is_authenticated:
        return DeleteAgentEndpointPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, id)
        endpoint.delete()
        return DeleteAgentEndpointPayload(success=True)
    except AgentEndpoint.DoesNotExist:
        return DeleteAgentEndpointPayload(success=False, error="Endpoint not found")


def suspend_agent_endpoint(info: strawberry.types.Info, id: strawberry.ID, reason: Optional[str] = None) -> SuspendAgentEndpointPayload:
    if not info.context.request.user.is_authenticated:
        return SuspendAgentEndpointPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, id)
    except AgentEndpoint.DoesNotExist:
        return SuspendAgentEndpointPayload(success=False, error="Endpoint not found")

    if endpoint.status == AgentEndpoint.Status.SUSPENDED:
        return SuspendAgentEndpointPayload(success=False, error="Endpoint already suspended")

    endpoint.status = AgentEndpoint.Status.SUSPENDED
    if reason:
        endpoint.metadata['suspension_reason'] = reason
    endpoint.save()

    return SuspendAgentEndpointPayload(success=True, endpoint=endpoint)


def activate_agent_endpoint(info: strawberry.types.Info, id: strawberry.ID) -> ActivateAgentEndpointPayload:
    if not info.context.request.user.is_authenticated:
        return ActivateAgentEndpointPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, id)
    except AgentEndpoint.DoesNotExist:
        return ActivateAgentEndpointPayload(success=False, error="Endpoint not found")

    if endpoint.status == AgentEndpoint.Status.ACTIVE:
        return ActivateAgentEndpointPayload(success=False, error="Endpoint already active")

    if endpoint.status == AgentEndpoint.Status.TERMINATED:
        return ActivateAgentEndpointPayload(success=False, error="Cannot activate terminated endpoint")

    endpoint.status = AgentEndpoint.Status.ACTIVE
    if 'suspension_reason' in endpoint.metadata:
        del endpoint.metadata['suspension_reason']
    endpoint.save()

    return ActivateAgentEndpointPayload(success=True, endpoint=endpoint)


def regenerate_endpoint_api_key(info: strawberry.types.Info, endpoint_id: strawberry.ID) -> RegenerateEndpointApiKeyPayload:
    if not info.context.request.user.is_authenticated:
        return RegenerateEndpointApiKeyPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, endpoint_id)

        raw_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        endpoint.api_key_hash = key_hash
        endpoint.api_key_prefix = key_prefix
        endpoint.save()

        return RegenerateEndpointApiKeyPayload(success=True, api_key=raw_key)

    except AgentEndpoint.DoesNotExist:
        return RegenerateEndpointApiKeyPayload(success=False, error="Endpoint not found")


def update_endpoint_status(info: strawberry.types.Info, endpoint_id: strawberry.ID, status: str) -> UpdateEndpointStatusPayload:
    if not info.context.request.user.is_authenticated:
        return UpdateEndpointStatusPayload(success=False, error="Authentication required")

    try:
        endpoint = _endpoint_for_caller(info, endpoint_id)

        if status not in [s.value for s in AgentEndpoint.Status]:
            return UpdateEndpointStatusPayload(success=False, error=f"Invalid status: {status}")

        endpoint.status = status
        endpoint.save()

        return UpdateEndpointStatusPayload(success=True, endpoint=endpoint)

    except AgentEndpoint.DoesNotExist:
        return UpdateEndpointStatusPayload(success=False, error="Endpoint not found")
