"""Enforce the same portal roles on every GraphQL operation."""
from graphql import GraphQLError
from strawberry.extensions import SchemaExtension

from zentinelle.auth.roles import can_admin, can_mutate, can_view

ADMIN_OPERATIONS = {
    'createPlatformApiKey', 'revokeApiKey', 'deleteApiKey', 'updateOrganizationSettings',
    'createLegalHold', 'updateLegalHold', 'releaseLegalHold', 'deleteLegalHold',
}
READ_OPERATIONS = {'listCompliancePacks', 'exportAuditLogs'}


class PortalRoleExtension(SchemaExtension):
    def resolve(self, next_, root, info, *args, **kwargs):
        if info.parent_type.name in ('Query', 'Mutation') and not info.field_name.startswith('__'):
            context = info.context
            request = context.get('request') if isinstance(context, dict) else getattr(context, 'request', None)
            user = getattr(request, 'user', None)
            if info.field_name in ADMIN_OPERATIONS:
                allowed = can_admin(user)
            elif info.parent_type.name == 'Mutation' and info.field_name not in READ_OPERATIONS:
                allowed = can_mutate(user)
            else:
                allowed = can_view(user)
            if not allowed:
                raise GraphQLError('Permission denied', extensions={'code': 'FORBIDDEN'})
        return next_(root, info, *args, **kwargs)
