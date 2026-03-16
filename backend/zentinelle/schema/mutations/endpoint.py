"""
AgentEndpoint-related GraphQL mutations.

Standalone version — uses tenant_id-based access instead of org membership.
"""
import logging

import graphene
from graphql_relay import from_global_id

from zentinelle.models import AgentEndpoint
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


class CreateAgentEndpointInput(graphene.InputObjectType):
    """Input for creating an agent endpoint."""
    name = graphene.String(required=True)
    agent_id = graphene.String()
    agent_type = graphene.String(required=True)
    tenant_id = graphene.String()
    capabilities = graphene.List(graphene.String)
    metadata = graphene.JSONString()
    config = graphene.JSONString()


class UpdateAgentEndpointInput(graphene.InputObjectType):
    """Input for updating an agent endpoint."""
    id = graphene.ID(required=True)
    name = graphene.String()
    agent_type = graphene.String()
    capabilities = graphene.List(graphene.String)
    metadata = graphene.JSONString()
    config = graphene.JSONString()


class CreateAgentEndpoint(graphene.Mutation):
    """Create a new agent endpoint."""
    class Arguments:
        organization_id = graphene.UUID(required=True)
        input = CreateAgentEndpointInput(required=True)

    endpoint = graphene.Field(AgentEndpointType)
    api_key = graphene.String()  # Only returned on creation
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, organization_id, input):
        if not info.context.user.is_authenticated:
            return CreateAgentEndpoint(success=False, error="Authentication required")

        # Validate agent_type
        valid_types = [t.value for t in AgentEndpoint.AgentType]
        if input.agent_type not in valid_types:
            return CreateAgentEndpoint(success=False, error=f"Invalid agent type: {input.agent_type}")

        try:
            # Generate API key using the model's method
            api_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

            # Generate agent_id if not provided
            import secrets as secrets_module
            agent_id = input.agent_id
            if not agent_id:
                agent_id = f"{input.agent_type}-{secrets_module.token_hex(4)}"

            # Create endpoint with hashed API key
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

            return CreateAgentEndpoint(
                success=True,
                endpoint=endpoint,
                api_key=api_key  # Return plain key only on creation
            )
        except Exception as e:
            logger.exception(f"Error creating agent endpoint: {e}")
            return CreateAgentEndpoint(success=False, error="Failed to create agent endpoint")


class UpdateAgentEndpoint(graphene.Mutation):
    """Update an existing agent endpoint."""
    class Arguments:
        input = UpdateAgentEndpointInput(required=True)

    endpoint = graphene.Field(AgentEndpointType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, input):
        if not info.context.user.is_authenticated:
            return UpdateAgentEndpoint(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(input.id))
        except AgentEndpoint.DoesNotExist:
            return UpdateAgentEndpoint(success=False, error="Endpoint not found")

        # Update fields
        if input.name:
            endpoint.name = input.name
        if input.agent_type:
            valid_types = [t.value for t in AgentEndpoint.AgentType]
            if input.agent_type not in valid_types:
                return UpdateAgentEndpoint(success=False, error=f"Invalid agent type: {input.agent_type}")
            endpoint.agent_type = input.agent_type
        if input.capabilities is not None:
            endpoint.capabilities = input.capabilities
        if input.metadata:
            endpoint.metadata = input.metadata
        if input.config:
            endpoint.config = input.config

        try:
            endpoint.save()
            return UpdateAgentEndpoint(success=True, endpoint=endpoint)
        except Exception as e:
            logger.exception(f"Error updating agent endpoint: {e}")
            return UpdateAgentEndpoint(success=False, error="Failed to update agent endpoint")


class DeleteAgentEndpoint(graphene.Mutation):
    """Delete an agent endpoint."""
    class Arguments:
        id = graphene.ID(required=True)

    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return DeleteAgentEndpoint(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(id))
            endpoint.delete()
            return DeleteAgentEndpoint(success=True)
        except AgentEndpoint.DoesNotExist:
            return DeleteAgentEndpoint(success=False, error="Endpoint not found")


class SuspendAgentEndpoint(graphene.Mutation):
    """Suspend an agent endpoint."""
    class Arguments:
        id = graphene.ID(required=True)
        reason = graphene.String()

    endpoint = graphene.Field(AgentEndpointType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id, reason=None):
        if not info.context.user.is_authenticated:
            return SuspendAgentEndpoint(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(id))
        except AgentEndpoint.DoesNotExist:
            return SuspendAgentEndpoint(success=False, error="Endpoint not found")

        if endpoint.status == AgentEndpoint.Status.SUSPENDED:
            return SuspendAgentEndpoint(success=False, error="Endpoint already suspended")

        endpoint.status = AgentEndpoint.Status.SUSPENDED
        if reason:
            endpoint.metadata['suspension_reason'] = reason
        endpoint.save()

        return SuspendAgentEndpoint(success=True, endpoint=endpoint)


class ActivateAgentEndpoint(graphene.Mutation):
    """Activate a suspended agent endpoint."""
    class Arguments:
        id = graphene.ID(required=True)

    endpoint = graphene.Field(AgentEndpointType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, id):
        if not info.context.user.is_authenticated:
            return ActivateAgentEndpoint(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(id))
        except AgentEndpoint.DoesNotExist:
            return ActivateAgentEndpoint(success=False, error="Endpoint not found")

        if endpoint.status == AgentEndpoint.Status.ACTIVE:
            return ActivateAgentEndpoint(success=False, error="Endpoint already active")

        if endpoint.status == AgentEndpoint.Status.TERMINATED:
            return ActivateAgentEndpoint(success=False, error="Cannot activate terminated endpoint")

        endpoint.status = AgentEndpoint.Status.ACTIVE
        if 'suspension_reason' in endpoint.metadata:
            del endpoint.metadata['suspension_reason']
        endpoint.save()

        return ActivateAgentEndpoint(success=True, endpoint=endpoint)


class RegenerateEndpointApiKey(graphene.Mutation):
    """Regenerate API key for an endpoint."""
    class Arguments:
        endpoint_id = graphene.ID(required=True)

    success = graphene.Boolean()
    api_key = graphene.String()  # Only returned once!
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, endpoint_id):
        if not info.context.user.is_authenticated:
            return RegenerateEndpointApiKey(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(endpoint_id))

            # Generate new key
            raw_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
            endpoint.api_key_hash = key_hash
            endpoint.api_key_prefix = key_prefix
            endpoint.save()

            return RegenerateEndpointApiKey(success=True, api_key=raw_key)

        except AgentEndpoint.DoesNotExist:
            return RegenerateEndpointApiKey(success=False, error="Endpoint not found")


class UpdateEndpointStatus(graphene.Mutation):
    """Update endpoint status (suspend/activate)."""
    class Arguments:
        endpoint_id = graphene.ID(required=True)
        status = graphene.String(required=True)

    endpoint = graphene.Field(AgentEndpointType)
    success = graphene.Boolean()
    error = graphene.String()

    @classmethod
    def mutate(cls, root, info, endpoint_id, status):
        if not info.context.user.is_authenticated:
            return UpdateEndpointStatus(success=False, error="Authentication required")

        try:
            endpoint = AgentEndpoint.objects.get(id=resolve_endpoint_id(endpoint_id))

            if status not in [s.value for s in AgentEndpoint.Status]:
                return UpdateEndpointStatus(success=False, error=f"Invalid status: {status}")

            endpoint.status = status
            endpoint.save()

            return UpdateEndpointStatus(success=True, endpoint=endpoint)

        except AgentEndpoint.DoesNotExist:
            return UpdateEndpointStatus(success=False, error="Endpoint not found")
