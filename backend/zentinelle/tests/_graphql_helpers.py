"""
Helpers for testing Strawberry GraphQL mutations directly via schema.execute_sync.

Builds a minimal request/context that satisfies the resolvers without going
through the HTTP view layer.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock

from django.contrib.auth.models import Group, User

from zentinelle.auth.roles import ensure_groups_exist


STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'


class _FakeAdminUser:
    """
    A user object compatible with both ``info.context.request.user`` checks
    and the auth_helpers RBAC functions in ``zentinelle.auth.roles``.

    Implements the bare attributes the resolvers touch. We use a class
    instead of a Django User because some resolvers reach for attributes
    (``.organization``) that the standalone User model does not have, and
    we want to keep tests honest about *what the resolver actually
    requires* rather than papering over real bugs with auto-magicked
    attribute mocks.
    """
    is_authenticated = True
    is_active = True
    is_staff = True
    is_superuser = True
    pk = 1
    id = 1
    username = "test_admin"

    def __init__(self, tenant_id=STANDALONE_TENANT):
        # Tenants for the standalone path
        self.tenant_id = tenant_id

    def __str__(self):
        return self.username

    class _GroupsManager:
        @staticmethod
        def values_list(*args, **kwargs):
            # Empty groups -> superuser still resolves to admin
            if kwargs.get('flat'):
                return []
            return []

    groups = _GroupsManager()


class _AnonUser:
    """Unauthenticated user surrogate."""
    is_authenticated = False
    is_active = False
    is_staff = False
    is_superuser = False
    pk = None
    id = None
    username = ""

    class _GroupsManager:
        @staticmethod
        def values_list(*args, **kwargs):
            return []

    groups = _GroupsManager()


def make_context(user=None):
    """
    Build a context object that mimics StrawberryDjangoContext.

    Resolvers access ``info.context.request.user``. We don't need the
    full Django HttpRequest — just an object exposing ``user``.
    """
    if user is None:
        user = _FakeAdminUser()
    request = MagicMock()
    request.user = user
    request.META = {}
    context = SimpleNamespace(request=request, response=MagicMock())
    return context


def admin_context(tenant_id=STANDALONE_TENANT):
    return make_context(_FakeAdminUser(tenant_id=tenant_id))


def anon_context():
    return make_context(_AnonUser())


def make_django_user(username='regular_user', is_superuser=True, role=None):
    """
    Build a real Django User. Some retention/legal-hold resolvers reach for
    User attributes via Django ORM, so for those tests we need a real row.
    """
    ensure_groups_exist()
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': is_superuser, 'is_staff': is_superuser},
    )
    if role:
        group = Group.objects.get(name=role)
        user.groups.add(group)
    return user
