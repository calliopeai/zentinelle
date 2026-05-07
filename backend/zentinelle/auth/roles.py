"""
RBAC roles for Zentinelle GRC portal.

Uses Django's built-in Group model. Three roles:
- admin: full CRUD, user management, compliance reports
- operator: manage policies, view audit logs, acknowledge alerts
- viewer: read-only dashboards, no mutations

Check permissions with:
    from zentinelle.auth.roles import has_role, can_mutate, can_admin

    if not can_mutate(info.context.request.user):
        return SomePayload(errors=["Permission denied"])
"""
from django.contrib.auth.models import Group

ROLE_ADMIN = 'zentinelle_admin'
ROLE_OPERATOR = 'zentinelle_operator'
ROLE_VIEWER = 'zentinelle_viewer'

ALL_ROLES = [ROLE_ADMIN, ROLE_OPERATOR, ROLE_VIEWER]


def ensure_groups_exist():
    """Create the role groups if they don't exist. Safe to call multiple times."""
    for role in ALL_ROLES:
        Group.objects.get_or_create(name=role)


def get_role(user) -> str:
    """Return the user's highest Zentinelle role, or 'viewer' as default."""
    if not user or not getattr(user, 'is_authenticated', False):
        return ''

    if getattr(user, 'is_superuser', False):
        return ROLE_ADMIN

    group_names = set(user.groups.values_list('name', flat=True))

    if ROLE_ADMIN in group_names:
        return ROLE_ADMIN
    if ROLE_OPERATOR in group_names:
        return ROLE_OPERATOR
    if ROLE_VIEWER in group_names:
        return ROLE_VIEWER

    if getattr(user, 'is_staff', False):
        return ROLE_ADMIN

    return ROLE_VIEWER


def has_role(user, role: str) -> bool:
    """Check if user has at least the given role level."""
    hierarchy = {ROLE_ADMIN: 3, ROLE_OPERATOR: 2, ROLE_VIEWER: 1, '': 0}
    user_level = hierarchy.get(get_role(user), 0)
    required_level = hierarchy.get(role, 0)
    return user_level >= required_level


def can_mutate(user) -> bool:
    """Can this user perform mutations (create/update/delete)?"""
    return has_role(user, ROLE_OPERATOR)


def can_admin(user) -> bool:
    """Can this user perform admin actions (user management, config)?"""
    return has_role(user, ROLE_ADMIN)


def can_view(user) -> bool:
    """Can this user view data?"""
    return has_role(user, ROLE_VIEWER)


def assign_role(user, role: str):
    """Assign a role to a user. Removes other Zentinelle roles."""
    ensure_groups_exist()
    zentinelle_groups = Group.objects.filter(name__in=ALL_ROLES)
    user.groups.remove(*zentinelle_groups)

    group = Group.objects.get(name=role)
    user.groups.add(group)
