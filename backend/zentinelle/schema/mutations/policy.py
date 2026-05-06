"""
Policy-related GraphQL mutations.

Standalone version — uses tenant_id-based access.
"""
import logging
import uuid
from typing import Optional

import strawberry
from strawberry.scalars import JSON
from graphql_relay import from_global_id

from zentinelle.models import Policy, AgentEndpoint
from zentinelle.schema.types import PolicyType


def _decode_id(global_or_raw_id):
    """Decode a relay global ID to a raw UUID string, or return as-is if already plain."""
    try:
        _type, raw_id = from_global_id(global_or_raw_id)
        if raw_id:
            return raw_id
    except Exception:
        pass
    return global_or_raw_id


logger = logging.getLogger(__name__)


@strawberry.input
class CreatePolicyInput:
    name: str
    description: Optional[str] = None
    policy_type: str
    scope_type: Optional[str] = None
    scope_endpoint_id: Optional[strawberry.ID] = None
    scope_user_id: Optional[str] = None
    config: Optional[JSON] = None
    priority: Optional[int] = None
    enforcement: Optional[str] = None
    enabled: Optional[bool] = None


@strawberry.input
class UpdatePolicyInput:
    id: strawberry.ID
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[JSON] = None
    priority: Optional[int] = None
    enforcement: Optional[str] = None
    enabled: Optional[bool] = None


@strawberry.type
class CreatePolicyPayload:
    policy: Optional[PolicyType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class UpdatePolicyPayload:
    policy: Optional[PolicyType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeletePolicyPayload:
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DuplicatePolicyPayload:
    policy: Optional[PolicyType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class TogglePolicyEnabledPayload:
    policy: Optional[PolicyType] = None
    success: Optional[bool] = None
    error: Optional[str] = None


def create_policy(info: strawberry.types.Info, organization_id: uuid.UUID, input: CreatePolicyInput) -> CreatePolicyPayload:
    if not info.context.request.user.is_authenticated:
        return CreatePolicyPayload(success=False, error="Authentication required")

    valid_types = [t.value for t in Policy.PolicyType]
    if input.policy_type not in valid_types:
        return CreatePolicyPayload(success=False, error=f"Invalid policy type: {input.policy_type}")

    policy_data = {
        'tenant_id': str(organization_id),
        'name': input.name,
        'policy_type': input.policy_type,
        'description': input.description or '',
        'config': input.config or {},
        'priority': input.priority or 0,
        'enabled': input.enabled if input.enabled is not None else True,
        'user_id': str(info.context.request.user.id) if info.context.request.user.is_authenticated else '',
    }

    scope_type = input.scope_type or Policy.ScopeType.ORGANIZATION
    policy_data['scope_type'] = scope_type

    if scope_type == Policy.ScopeType.ENDPOINT and input.scope_endpoint_id:
        try:
            endpoint = AgentEndpoint.objects.get(id=input.scope_endpoint_id)
            policy_data['scope_endpoint'] = endpoint
        except AgentEndpoint.DoesNotExist:
            return CreatePolicyPayload(success=False, error="Endpoint not found")

    elif scope_type == Policy.ScopeType.USER and input.scope_user_id:
        policy_data['scope_user_id_ext'] = input.scope_user_id

    if input.enforcement:
        valid_enforcement = [e.value for e in Policy.Enforcement]
        if input.enforcement not in valid_enforcement:
            return CreatePolicyPayload(success=False, error=f"Invalid enforcement: {input.enforcement}")
        policy_data['enforcement'] = input.enforcement

    try:
        policy = Policy.objects.create(**policy_data)

        from zentinelle.services.policy_engine import PolicyEngine
        PolicyEngine().invalidate_cache(policy.tenant_id)

        return CreatePolicyPayload(success=True, policy=policy)
    except Exception as e:
        logger.exception(f"Error creating policy: {e}")
        return CreatePolicyPayload(success=False, error="Failed to create policy")


def update_policy(info: strawberry.types.Info, input: UpdatePolicyInput) -> UpdatePolicyPayload:
    if not info.context.request.user.is_authenticated:
        return UpdatePolicyPayload(success=False, error="Authentication required")

    try:
        policy = Policy.objects.get(id=_decode_id(input.id))
    except Policy.DoesNotExist:
        return UpdatePolicyPayload(success=False, error="Policy not found")

    if input.name:
        policy.name = input.name
    if input.description is not None:
        policy.description = input.description
    if input.config:
        policy.config = input.config
    if input.priority is not None:
        policy.priority = input.priority
    if input.enabled is not None:
        policy.enabled = input.enabled
    if input.enforcement:
        valid_enforcement = [e.value for e in Policy.Enforcement]
        if input.enforcement not in valid_enforcement:
            return UpdatePolicyPayload(success=False, error=f"Invalid enforcement: {input.enforcement}")
        policy.enforcement = input.enforcement

    try:
        policy.save()

        from zentinelle.services.policy_engine import PolicyEngine
        PolicyEngine().invalidate_cache(policy.tenant_id)

        return UpdatePolicyPayload(success=True, policy=policy)
    except Exception as e:
        logger.exception(f"Error updating policy: {e}")
        return UpdatePolicyPayload(success=False, error="Failed to update policy")


def delete_policy(info: strawberry.types.Info, id: strawberry.ID) -> DeletePolicyPayload:
    if not info.context.request.user.is_authenticated:
        return DeletePolicyPayload(success=False, error="Authentication required")

    try:
        policy = Policy.objects.get(id=_decode_id(id))
        tenant_id = policy.tenant_id
        policy.delete()

        from zentinelle.services.policy_engine import PolicyEngine
        PolicyEngine().invalidate_cache(tenant_id)

        return DeletePolicyPayload(success=True)
    except Policy.DoesNotExist:
        return DeletePolicyPayload(success=False, error="Policy not found")


def duplicate_policy(info: strawberry.types.Info, id: strawberry.ID, new_name: Optional[str] = None) -> DuplicatePolicyPayload:
    if not info.context.request.user.is_authenticated:
        return DuplicatePolicyPayload(success=False, error="Authentication required")

    try:
        original = Policy.objects.get(id=_decode_id(id))
    except Policy.DoesNotExist:
        return DuplicatePolicyPayload(success=False, error="Policy not found")

    new_policy = Policy.objects.create(
        tenant_id=original.tenant_id,
        name=new_name or f"{original.name} (Copy)",
        description=original.description,
        policy_type=original.policy_type,
        scope_type=original.scope_type,
        scope_sub_organization_id_ext=original.scope_sub_organization_id_ext,
        scope_deployment_id_ext=original.scope_deployment_id_ext,
        scope_endpoint=original.scope_endpoint,
        scope_user_id_ext=original.scope_user_id_ext,
        config=original.config.copy(),
        priority=original.priority,
        enforcement=original.enforcement,
        enabled=False,
    )

    return DuplicatePolicyPayload(success=True, policy=new_policy)


def toggle_policy_enabled(info: strawberry.types.Info, id: strawberry.ID) -> TogglePolicyEnabledPayload:
    if not info.context.request.user.is_authenticated:
        return TogglePolicyEnabledPayload(success=False, error="Authentication required")

    try:
        policy = Policy.objects.get(id=id)
        policy.enabled = not policy.enabled
        policy.save(update_fields=['enabled', 'updated_at'])

        from zentinelle.services.policy_engine import PolicyEngine
        PolicyEngine().invalidate_cache(policy.tenant_id)

        return TogglePolicyEnabledPayload(success=True, policy=policy)
    except Policy.DoesNotExist:
        return TogglePolicyEnabledPayload(success=False, error="Policy not found")
