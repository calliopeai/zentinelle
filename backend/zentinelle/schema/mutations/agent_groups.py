"""
Agent Group Mutations.

GraphQL mutations for managing agent groups.
"""
import strawberry
from typing import Optional, Annotated
from graphql_relay import from_global_id
from zentinelle.schema.auth_helpers import get_request_tenant_id

AgentGroupType = Annotated['AgentGroupType', strawberry.lazy('zentinelle.schema.types')]


def _decode_id(global_or_raw_id):
    """Decode a relay global ID to a raw UUID string, or return as-is."""
    try:
        _type, raw_id = from_global_id(global_or_raw_id)
        if raw_id:
            return raw_id
    except Exception:
        pass
    return global_or_raw_id


@strawberry.type
class CreateAgentGroupPayload:
    group: Optional['AgentGroupType'] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class UpdateAgentGroupPayload:
    group: Optional['AgentGroupType'] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class DeleteAgentGroupPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


@strawberry.type
class AssignAgentToGroupPayload:
    success: Optional[bool] = None
    errors: list[str] = strawberry.field(default_factory=list)


def create_agent_group(
    info: strawberry.types.Info,
    name: str,
    description: Optional[str] = '',
    tier: Optional[str] = 'standard',
    color: Optional[str] = 'brand',
) -> CreateAgentGroupPayload:
    from zentinelle.models.agent_group import AgentGroup
    from django.utils.text import slugify
    tenant_id = get_request_tenant_id(info.context.request.user) or 'default'
    base_slug = slugify(name)[:240]
    slug = base_slug
    i = 1
    while AgentGroup.objects.filter(
        tenant_id=tenant_id, slug=slug
    ).exists():
        slug = f'{base_slug}-{i}'
        i += 1
    group = AgentGroup.objects.create(
        tenant_id=tenant_id, name=name, slug=slug,
        description=description, tier=tier, color=color,
    )
    return CreateAgentGroupPayload(group=group, errors=[])


def update_agent_group(
    info: strawberry.types.Info,
    id: strawberry.ID,
    name: Optional[str] = None,
    description: Optional[str] = None,
    tier: Optional[str] = None,
    color: Optional[str] = None,
) -> UpdateAgentGroupPayload:
    from zentinelle.models.agent_group import AgentGroup
    tenant_id = get_request_tenant_id(info.context.request.user) or 'default'
    try:
        group = AgentGroup.objects.get(
            id=_decode_id(id), tenant_id=tenant_id
        )
    except AgentGroup.DoesNotExist:
        return UpdateAgentGroupPayload(
            group=None, errors=['Group not found']
        )
    for field, value in [
        ('name', name), ('description', description),
        ('tier', tier), ('color', color),
    ]:
        if value is not None:
            setattr(group, field, value)
    group.save()
    return UpdateAgentGroupPayload(group=group, errors=[])


def delete_agent_group(
    info: strawberry.types.Info,
    id: strawberry.ID,
) -> DeleteAgentGroupPayload:
    from zentinelle.models.agent_group import AgentGroup
    tenant_id = get_request_tenant_id(info.context.request.user) or 'default'
    deleted, _ = AgentGroup.objects.filter(
        id=_decode_id(id), tenant_id=tenant_id
    ).delete()
    if deleted:
        return DeleteAgentGroupPayload(success=True, errors=[])
    return DeleteAgentGroupPayload(
        success=False, errors=['Group not found']
    )


def assign_agent_to_group(
    info: strawberry.types.Info,
    agent_endpoint_id: strawberry.ID,
    group_id: Optional[strawberry.ID] = None,
) -> AssignAgentToGroupPayload:
    from zentinelle.models.endpoint import AgentEndpoint
    from zentinelle.models.agent_group import AgentGroup
    tenant_id = get_request_tenant_id(info.context.request.user) or 'default'
    try:
        endpoint = AgentEndpoint.objects.get(
            id=_decode_id(agent_endpoint_id), tenant_id=tenant_id
        )
    except AgentEndpoint.DoesNotExist:
        return AssignAgentToGroupPayload(
            success=False, errors=['Agent not found']
        )
    if group_id:
        try:
            group = AgentGroup.objects.get(
                id=_decode_id(group_id), tenant_id=tenant_id
            )
            endpoint.group = group
        except AgentGroup.DoesNotExist:
            return AssignAgentToGroupPayload(
                success=False, errors=['Group not found']
            )
    else:
        endpoint.group = None
    endpoint.save(update_fields=['group'])
    return AssignAgentToGroupPayload(success=True, errors=[])
