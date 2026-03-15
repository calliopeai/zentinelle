"""
Authorization helpers for Zentinelle GraphQL schema.

Provides consistent authorization patterns for queries and mutations.

Standalone version — no dependency on core.models or organization.models.
Uses tenant_id-based access control.
"""


def is_internal_admin(user):
    """
    Check if a user is an internal admin.

    In standalone mode, staff and superuser flags are used.
    """
    if not user or not user.is_authenticated:
        return False
    return getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False)


def get_user_org_ids(user):
    """
    Get organization IDs the user has access to.

    Returns None for internal admins (meaning all orgs allowed).
    Returns list of org IDs for regular users.

    In standalone mode, tenant_id is used instead of org membership.
    """
    if not user or not user.is_authenticated:
        return []

    # Internal admins see all tenants
    if is_internal_admin(user):
        return None  # None means "all" - caller should not filter

    # In standalone mode, return empty list (tenant filtering is
    # handled at the API/middleware layer, not via org membership)
    return []


def user_has_org_access(user, org_id) -> bool:
    """
    Check if a user has access to a specific organization/tenant.

    Internal admins have access to all organizations.
    """
    if not user or not user.is_authenticated:
        return False

    if is_internal_admin(user):
        return True

    return False


def filter_by_org(queryset, user, org_field='tenant_id', global_view=False, organization_id=None):
    """
    Filter a queryset by tenant access.

    Internal admins always have full access.
    When organization_id is provided, results are scoped to that tenant.

    Args:
        queryset: Django QuerySet to filter
        user: Django User instance
        org_field: Field name to filter on (default: 'tenant_id')
        global_view: Deprecated
        organization_id: If provided, scope results to this tenant only.

    Returns:
        Filtered queryset
    """
    if is_internal_admin(user):
        if organization_id:
            return queryset.filter(**{org_field: str(organization_id)})
        return queryset

    # Non-admin users: return nothing in standalone mode
    # (tenant filtering should be handled upstream)
    return queryset.none()


def get_request_tenant_id(user):
    """
    Get the tenant_id for the current request user.
    - ZentinelleAgentUser (API key auth): returns user.tenant_id
    - Django staff user (session auth): returns "default"
    - Unauthenticated: returns None
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    # API key auth (ZentinelleAgentUser has tenant_id attribute)
    if hasattr(user, 'tenant_id') and not hasattr(user, 'is_staff'):
        return user.tenant_id
    # Session auth (Django User) - staff only in standalone
    if getattr(user, 'is_staff', False) or getattr(user, 'is_superuser', False):
        return "default"
    return None
