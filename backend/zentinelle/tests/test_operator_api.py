"""Contract tests for token-authenticated operator routes."""
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory

from zentinelle.api.auth import (ZentinellePlatformKeyAuthentication,
                                 ZentinelleServiceUser)
from zentinelle.api.views.operator import IsPlatformOperator
from zentinelle.models import APIKey


class OperatorAuthTests(SimpleTestCase):
    def test_platform_key_authenticates_bearer_key(self):
        request = APIRequestFactory().get(
            '/operator/agents', HTTP_AUTHORIZATION='Bearer sk_platform_test')
        record = Mock(spec=APIKey)
        record.tenant_id = 'tenant-a'
        record.key_type = APIKey.KeyType.USER
        record.is_active = True
        record.scopes = ['read', 'write']
        record.id = 'key-id'
        with patch.object(APIKey.objects, 'get', return_value=record), \
                patch.object(APIKey, 'verify_api_key', return_value=True):
            user, token = ZentinellePlatformKeyAuthentication().authenticate(request)
        self.assertIsInstance(user, ZentinelleServiceUser)
        self.assertEqual(user.tenant_id, 'tenant-a')
        self.assertEqual(token, 'sk_platform_test')

    def test_operator_permission_requires_write_for_mutations(self):
        request = APIRequestFactory().post('/operator/policies')
        request.user = Mock(is_authenticated=True)
        request.user.has_scope.side_effect = lambda scope: scope == 'read'
        self.assertFalse(IsPlatformOperator().has_permission(request, None))
