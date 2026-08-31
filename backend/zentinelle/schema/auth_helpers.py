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
    """Whether this caller may act on data belonging to ``org_id``.

    The tenant is compared. It was not before: this function took ``org_id``
    and never read it, so it answered True for any authenticated viewer and
    the twenty-odd resolvers that used it as their only tenant boundary had
    none. Every one of those is `Model.objects.get(pk=<id from the wire>)`
    followed by this check, which is the classic multi-tenant leak — a UUID is
    unguessable, but unguessable is not a permission.

    An admin still passes for any tenant. On this product an internal admin is
    the operator of the install rather than a customer, and the Django admin
    already reaches every row; narrowing that here would change who can
    administer a deployment while pretending to be a bug fix.

    A caller whose tenant cannot be resolved is refused rather than allowed:
    the alternative is a request that acts on data it could not name.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return False

    # The tenant comparison comes first, and the role check is only reached for
    # a Django user. `can_admin` reads `user.groups`, which an agent key's
    # `ZentinelleAgentUser` does not have — asking it raises AttributeError,
    # and every caller here sits inside a broad `except`, so the refusal would
    # arrive as "something went wrong" rather than as an answer.
    tenant_id = get_request_tenant_id(user)
    if tenant_id and org_id and str(tenant_id) == str(org_id):
        return True

    # An internal admin still reaches every tenant: on this product that is the
    # operator of the install rather than a customer, and the Django admin
    # already reaches every row. Only a Django user can hold that role.
    if hasattr(user, 'groups') and can_admin(user):
        return True

    return False


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
        # Honoured only for a caller who may act on that tenant. It arrives
        # from a resolver argument, so believing it outright would let any
        # caller select the tenant they read — the same defect
        # `user_has_org_access` had, one layer down.
        if not user_has_org_access(user, organization_id):
            return queryset.none()
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


def require_request_tenant_id(user) -> str:
    """The caller's tenant, or a refusal. Never an invented one.

    Ten resolvers wrote `get_request_tenant_id(user) or 'default'`. Any two
    callers whose tenant could not be resolved landed in that same bucket and
    read and wrote each other's rows — a smaller hole than an unscoped query,
    since it needs resolution to fail first, but the same failure with a
    friendlier name.

    A shared fallback is worse than no fallback: it turns a misconfiguration
    into a *working* request against a tenant nobody owns, so nothing ever
    surfaces the problem that caused it. `filter_by_org` already models the
    right answer, returning `queryset.none()` when it cannot resolve a tenant
    rather than inventing one.

    Raises GraphQLError, which is what a caller acting on nothing should be
    told, rather than being handed somebody else's data.
    """
    from graphql import GraphQLError

    tenant_id = get_request_tenant_id(user)
    if not tenant_id:
        raise GraphQLError(
            'No tenant could be resolved for this request, so there is nothing '
            'to act on.'
        )
    return tenant_id
