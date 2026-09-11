from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory, SimpleTestCase

from zentinelle.api.graphql_view import ZentinelleGraphQLView


class GraphQLAuthProfileTests(SimpleTestCase):
    def test_arbitrary_session_header_does_not_establish_identity(self):
        request = RequestFactory().post('/graphql', HTTP_AUTHORIZATION='Session anything')
        request.user = AnonymousUser()
        view = ZentinelleGraphQLView(schema=None)
        with patch('zentinelle.api.graphql_view.auth_mode_value', return_value='local'):
            view._apply_auth_mode(request)
        self.assertFalse(request.user.is_authenticated)

    def test_open_profile_is_the_only_profile_with_synthetic_admin(self):
        request = RequestFactory().post('/graphql')
        request.user = AnonymousUser()
        view = ZentinelleGraphQLView(schema=None)
        with patch('zentinelle.api.graphql_view.auth_mode_value', return_value='open'):
            view._apply_auth_mode(request)
        self.assertTrue(request.user.is_superuser)
