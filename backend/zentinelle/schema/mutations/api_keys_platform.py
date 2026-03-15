"""
Platform API Key management mutations.

Allows portal users and admins to create, list, and revoke API keys
for programmatic access to the Zentinelle GRC API.
"""
import graphene
from graphql import GraphQLError
from django.utils import timezone

from zentinelle.models.api_key import APIKey
from zentinelle.schema.auth_helpers import get_request_tenant_id, is_internal_admin


class CreatePlatformAPIKey(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String()
        scopes = graphene.List(graphene.String)
        expires_at = graphene.DateTime()

    ok = graphene.Boolean()
    # Return the full key ONCE — never stored
    api_key = graphene.String()
    key_prefix = graphene.String()
    key_id = graphene.ID()
    error = graphene.String()

    @staticmethod
    def mutate(root, info, name, description="", scopes=None, expires_at=None):
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return CreatePlatformAPIKey(ok=False, error="authentication_required")

        if scopes is None:
            scopes = ["read", "write"]

        full_key, key_hash, key_prefix = APIKey.generate_api_key()
        obj = APIKey.objects.create(
            tenant_id=tenant_id,
            user_id=str(user.pk) if hasattr(user, 'pk') else "",
            name=name,
            description=description,
            key_prefix=key_prefix,
            key_hash=key_hash,
            scopes=scopes,
            expires_at=expires_at,
        )
        return CreatePlatformAPIKey(ok=True, api_key=full_key, key_prefix=key_prefix, key_id=str(obj.pk))


class RevokeAPIKey(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()
    error = graphene.String()

    @staticmethod
    def mutate(root, info, id):
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return RevokeAPIKey(ok=False, error="authentication_required")

        try:
            if is_internal_admin(user):
                key = APIKey.objects.get(pk=id)
            else:
                key = APIKey.objects.get(pk=id, tenant_id=tenant_id)
        except APIKey.DoesNotExist:
            return RevokeAPIKey(ok=False, error="not_found")

        key.revoke()
        return RevokeAPIKey(ok=True)


class DeleteAPIKey(graphene.Mutation):
    class Arguments:
        id = graphene.ID(required=True)

    ok = graphene.Boolean()
    error = graphene.String()

    @staticmethod
    def mutate(root, info, id):
        user = info.context.user
        tenant_id = get_request_tenant_id(user)
        if not tenant_id:
            return DeleteAPIKey(ok=False, error="authentication_required")

        try:
            if is_internal_admin(user):
                key = APIKey.objects.get(pk=id)
            else:
                key = APIKey.objects.get(pk=id, tenant_id=tenant_id)
        except APIKey.DoesNotExist:
            return DeleteAPIKey(ok=False, error="not_found")

        key.delete()
        return DeleteAPIKey(ok=True)
