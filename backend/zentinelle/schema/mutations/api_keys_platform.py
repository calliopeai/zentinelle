"""
Platform API Key management mutations.

Allows portal users and admins to create, list, and revoke API keys
for programmatic access to the Zentinelle GRC API.
"""
from datetime import datetime
from typing import Optional

import strawberry

from zentinelle.models.api_key import APIKey
from zentinelle.schema.auth_helpers import get_request_tenant_id, is_internal_admin


@strawberry.type
class CreatePlatformAPIKeyPayload:
    ok: Optional[bool] = None
    api_key: Optional[str] = None
    key_prefix: Optional[str] = None
    key_id: Optional[strawberry.ID] = None
    error: Optional[str] = None


@strawberry.type
class RevokeAPIKeyPayload:
    ok: Optional[bool] = None
    error: Optional[str] = None


@strawberry.type
class DeleteAPIKeyPayload:
    ok: Optional[bool] = None
    error: Optional[str] = None


def create_platform_api_key(info: strawberry.types.Info, name: str, description: Optional[str] = "", scopes: Optional[list[str]] = None, expires_at: Optional[datetime] = None) -> CreatePlatformAPIKeyPayload:
    user = info.context.request.user
    tenant_id = get_request_tenant_id(user)
    if not tenant_id:
        return CreatePlatformAPIKeyPayload(ok=False, error="authentication_required")

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
    return CreatePlatformAPIKeyPayload(ok=True, api_key=full_key, key_prefix=key_prefix, key_id=str(obj.pk))


def revoke_api_key(info: strawberry.types.Info, id: strawberry.ID) -> RevokeAPIKeyPayload:
    user = info.context.request.user
    tenant_id = get_request_tenant_id(user)
    if not tenant_id:
        return RevokeAPIKeyPayload(ok=False, error="authentication_required")

    try:
        if is_internal_admin(user):
            key = APIKey.objects.get(pk=id)
        else:
            key = APIKey.objects.get(pk=id, tenant_id=tenant_id)
    except APIKey.DoesNotExist:
        return RevokeAPIKeyPayload(ok=False, error="not_found")

    key.revoke()
    return RevokeAPIKeyPayload(ok=True)


def delete_api_key(info: strawberry.types.Info, id: strawberry.ID) -> DeleteAPIKeyPayload:
    user = info.context.request.user
    tenant_id = get_request_tenant_id(user)
    if not tenant_id:
        return DeleteAPIKeyPayload(ok=False, error="authentication_required")

    try:
        if is_internal_admin(user):
            key = APIKey.objects.get(pk=id)
        else:
            key = APIKey.objects.get(pk=id, tenant_id=tenant_id)
    except APIKey.DoesNotExist:
        return DeleteAPIKeyPayload(ok=False, error="not_found")

    key.delete()
    return DeleteAPIKeyPayload(ok=True)
