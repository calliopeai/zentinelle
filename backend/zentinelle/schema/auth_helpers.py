"""
Authorization helpers for Zentinelle GraphQL schema.

Provides consistent authorization patterns for queries and mutations.
"""
from core.models.internal_admin import is_internal_admin


def get_user_org_ids(user):
    """
    Get organization IDs the user has access to.

    Returns None for internal admins (meaning all orgs allowed).
    Returns list of org IDs for regular users.
    """
    if not user or not user.is_authenticated:
        return []

    # Internal admins (superusers, staff, calliope.ai domain, etc.) see all orgs
    if is_internal_admin(user):
        return None  # None means "all orgs" - caller should not filter

    from organization.models import OrganizationMember
    return list(OrganizationMember.objects.filter(
        member=user
    ).exclude(
        organization__status='inactive'
    ).values_list('organization_id', flat=True))


def user_has_org_access(user, org_id) -> bool:
    """
    Check if a user has access to a specific organization.

    Internal admins have access to all organizations.
    Regular users only have access to orgs they're members of.

    Args:
        user: Django User instance
        org_id: UUID or string of organization ID

    Returns:
        True if user can access the organization
    """
    if not user or not user.is_authenticated:
        return False

    # Internal admins have access to everything
    if is_internal_admin(user):
        return True

    # Check org membership
    org_ids = get_user_org_ids(user)
    return str(org_id) in [str(oid) for oid in org_ids]


def filter_by_org(queryset, user, org_field='organization_id', global_view=False, organization_id=None):
    """
    Filter a queryset by user's organization membership.

    Internal admins (staff, superusers, calliope.ai domain) always have full
    access — they can view and operate on any organization's records.
    When organization_id is provided, results are scoped to that org.

    Regular users see only records belonging to their organizations.

    Args:
        queryset: Django QuerySet to filter
        user: Django User instance
        org_field: Field name to filter on (default: 'organization_id')
        global_view: Deprecated — internal admins always have global view.
        organization_id: If provided, scope results to this org only.

    Returns:
        Filtered queryset
    """
    # Internal admins always have full access, optionally scoped to a specific org
    if is_internal_admin(user):
        if organization_id:
            return queryset.filter(**{org_field: organization_id})
        return queryset

    # Regular users: filter by org membership
    from organization.models import OrganizationMember
    org_ids = list(OrganizationMember.objects.filter(
        member=user
    ).values_list('organization_id', flat=True))

    return queryset.filter(**{f'{org_field}__in': org_ids})
