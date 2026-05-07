"""
Authorization helpers for Zentinelle GraphQL schema.

Uses the RBAC role system from zentinelle.auth.roles.
"""
from zentinelle.auth.roles import can_view, can_admin


def is_internal_admin(user):
    """Check if a user has admin-level access."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return can_admin(user)


def get_user_org_ids(user):
    """
    Get organization IDs the user has access to.
    Returns None for admins (all orgs). Returns [] for non-authenticated.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return []
    if can_admin(user):
        return None
    return []


def user_has_org_access(user, org_id) -> bool:
    """Check if a user has access to a specific tenant."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return can_view(user)


def filter_by_org(queryset, user, org_field='tenant_id', global_view=False, organization_id=None):
    """
    Filter a queryset by tenant access.

    Always scopes to the user's tenant_id. Never returns unfiltered data.
    When organization_id is provided, results are scoped to that tenant instead.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return queryset.none()

    if not can_view(user):
        return queryset.none()

    tenant_id = get_request_tenant_id(user)
    if organization_id:
        return queryset.filter(**{org_field: str(organization_id)})
    if tenant_id:
        return queryset.filter(**{org_field: str(tenant_id)})
    return queryset.none()


def get_request_tenant_id(user):
    """
    Get the tenant_id for the current request user.
    - ZentinelleAgentUser (API key auth): returns user.tenant_id
    - Django user (session auth): returns stable default tenant
    - Unauthenticated: returns None
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    if hasattr(user, 'tenant_id') and not hasattr(user, 'is_staff'):
        return user.tenant_id
    if can_view(user):
        return "00000000-0000-0000-0000-000000000001"
    return None
