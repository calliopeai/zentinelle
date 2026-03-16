import graphene
from zentinelle.schema.auth_helpers import get_request_tenant_id


class CreateAgentGroup(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String()
        tier = graphene.String()
        color = graphene.String()

    group = graphene.Field(lambda: __import__('zentinelle.schema.types', fromlist=['AgentGroupType']).AgentGroupType)
    errors = graphene.List(graphene.String)

    @staticmethod
    def mutate(root, info, name, description='', tier='standard', color='brand'):
        from zentinelle.models.agent_group import AgentGroup
        from django.utils.text import slugify
        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        base_slug = slugify(name)[:240]
        slug = base_slug
        i = 1
        while AgentGroup.objects.filter(tenant_id=tenant_id, slug=slug).exists():
            slug = f'{base_slug}-{i}'
            i += 1
        group = AgentGroup.objects.create(
            tenant_id=tenant_id, name=name, slug=slug,
            description=description, tier=tier, color=color,
        )
        return CreateAgentGroup(group=group, errors=[])


class UpdateAgentGroup(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)
        name = graphene.String()
        description = graphene.String()
        tier = graphene.String()
        color = graphene.String()

    group = graphene.Field(lambda: __import__('zentinelle.schema.types', fromlist=['AgentGroupType']).AgentGroupType)
    errors = graphene.List(graphene.String)

    @staticmethod
    def mutate(root, info, id, **kwargs):
        from zentinelle.models.agent_group import AgentGroup
        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        try:
            group = AgentGroup.objects.get(id=id, tenant_id=tenant_id)
        except AgentGroup.DoesNotExist:
            return UpdateAgentGroup(group=None, errors=['Group not found'])
        for field in ('name', 'description', 'tier', 'color'):
            if field in kwargs and kwargs[field] is not None:
                setattr(group, field, kwargs[field])
        group.save()
        return UpdateAgentGroup(group=group, errors=[])


class DeleteAgentGroup(graphene.Mutation):
    class Arguments:
        id = graphene.UUID(required=True)

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @staticmethod
    def mutate(root, info, id):
        from zentinelle.models.agent_group import AgentGroup
        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        deleted, _ = AgentGroup.objects.filter(id=id, tenant_id=tenant_id).delete()
        if deleted:
            return DeleteAgentGroup(success=True, errors=[])
        return DeleteAgentGroup(success=False, errors=['Group not found'])


class AssignAgentToGroup(graphene.Mutation):
    class Arguments:
        agent_endpoint_id = graphene.UUID(required=True)
        group_id = graphene.UUID()  # null to remove from group

    success = graphene.Boolean()
    errors = graphene.List(graphene.String)

    @staticmethod
    def mutate(root, info, agent_endpoint_id, group_id=None):
        from zentinelle.models.endpoint import AgentEndpoint
        from zentinelle.models.agent_group import AgentGroup
        tenant_id = get_request_tenant_id(info.context.user) or 'default'
        try:
            endpoint = AgentEndpoint.objects.get(id=agent_endpoint_id, tenant_id=tenant_id)
        except AgentEndpoint.DoesNotExist:
            return AssignAgentToGroup(success=False, errors=['Agent not found'])
        if group_id:
            try:
                group = AgentGroup.objects.get(id=group_id, tenant_id=tenant_id)
                endpoint.group = group
            except AgentGroup.DoesNotExist:
                return AssignAgentToGroup(success=False, errors=['Group not found'])
        else:
            endpoint.group = None
        endpoint.save(update_fields=['group'])
        return AssignAgentToGroup(success=True, errors=[])
