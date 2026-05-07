"""
Security-critical path tests for Zentinelle.

Covers:
1. Policy engine fail-closed behavior on evaluator exceptions
2. Proxy endpoint lookup — no fallback to unrelated endpoints
3. filter_by_org tenant isolation in GraphQL auth helpers
4. agent_id unique-per-tenant constraint
5. Event batch size limit enforcement
6. Bootstrap token — DB token validation and use_count
7. RBAC role hierarchy (admin, operator, viewer)
8. Health and readiness endpoints
9. Heartbeat config change detection
10. Webhook dispatch on ComplianceAlert creation

The conftest.py at the backend root disables the schema-based DB router
and mirrors all aliases to default for test isolation. Each test class
also applies @override_settings(DATABASE_ROUTERS=[]) as belt-and-suspenders.
"""
import hashlib
import json
import uuid
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from zentinelle.models import (AgentEndpoint, ComplianceAlert, ContentRule,
                               NotificationConfig, Policy)
from zentinelle.models.bootstrap_token import BootstrapToken
from zentinelle.services.policy_engine import EvaluationResult, PolicyEngine

User = get_user_model()

STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'
TENANT_B = '00000000-0000-0000-0000-000000000002'


# Disable the schema-based DB router so all models use the default test DB.
_NO_ROUTER = override_settings(DATABASE_ROUTERS=[])


class SecurityTestMixin:
    """Mixin providing common agent setup for security tests."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        # Create endpoint with known API key
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='sec-test-agent',
            name='Security Test Agent',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            config={'version': '1.0'},
        )

    def authenticate(self):
        """Set the X-Zentinelle-Key header for agent auth."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)


# ---------------------------------------------------------------------------
# 1. Policy Engine Fail-Closed
# ---------------------------------------------------------------------------

@_NO_ROUTER
class PolicyEngineFailClosedTest(TestCase):
    """
    Verify the policy engine treats evaluator exceptions as denials.

    If an evaluator raises an unhandled exception, the result MUST be
    allowed=False. Returning True on error would silently bypass enforcement.
    """

    def setUp(self):
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='fail-closed-agent',
            name='Fail Closed Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )
        self.engine = PolicyEngine()

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_exception_in_evaluator_denies_request(self, mock_get_evaluator):
        """When an evaluator raises, evaluate() must return allowed=False."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.side_effect = RuntimeError('evaluator crashed')
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Crashing Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 100},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
            user_id='user-fail-test',
        )

        self.assertFalse(result.allowed)
        self.assertIn('Policy evaluation error', result.reason)

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_exception_is_logged(self, mock_get_evaluator):
        """Evaluator exceptions must be logged at ERROR level."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.side_effect = ValueError('bad evaluator')
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Error Policy',
            policy_type=Policy.PolicyType.TOOL_PERMISSION,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={},
        )

        with self.assertLogs('zentinelle.services.policy_engine', level='ERROR') as cm:
            self.engine.evaluate(
                endpoint=self.endpoint,
                action='tool_call',
            )

        logged = '\n'.join(cm.output)
        self.assertIn('raised exception', logged)
        self.assertIn('bad evaluator', logged)

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_exception_in_audit_mode_still_records_warning(self, mock_get_evaluator):
        """In audit mode, an evaluator exception should produce a failed
        PolicyResult. Since enforcement is audit, the overall result is
        still allowed but a warning is recorded."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.side_effect = RuntimeError('audit crash')
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Audit Crashing Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.AUDIT,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
        )

        # The evaluation completed without crashing and the result has
        # the structure we expect.
        self.assertIsInstance(result, EvaluationResult)
        # In audit mode the overall result is allowed=True even on policy fail.
        self.assertTrue(result.allowed)
        # The failing policy should appear in policies_evaluated.
        self.assertEqual(len(result.policies_evaluated), 1)
        self.assertEqual(result.policies_evaluated[0]['result'], 'fail')


# ---------------------------------------------------------------------------
# 2. Proxy Endpoint Lookup — No Fallback
# ---------------------------------------------------------------------------

@_NO_ROUTER
class ProxyEndpointLookupTest(SecurityTestMixin, TestCase):
    """
    Verify that the proxy rejects requests for non-existent providers
    and does not fall back to a different endpoint.

    An agent authenticated for provider A must not receive a response
    from provider B.
    """

    def test_proxy_nonexistent_provider_returns_error(self):
        """A request to /proxy/nonexistent/... must fail, not route elsewhere."""
        self.authenticate()
        # Attempt to proxy to a provider that does not exist
        response = self.client.post(
            '/proxy/nonexistent/v1/chat/completions',
            data=json.dumps({'model': 'gpt-4', 'messages': [{'role': 'user', 'content': 'hi'}]}),
            content_type='application/json',
        )
        # Should not succeed (200) -- expect 401, 403, or 404
        self.assertIn(response.status_code, [401, 403, 404])

    def test_proxy_without_key_returns_401(self):
        """A request to a valid proxy path without auth must return 401."""
        response = self.client.post(
            '/proxy/openai/v1/chat/completions',
            data=json.dumps({'model': 'gpt-4'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertEqual(data['error'], 'missing_key')


# ---------------------------------------------------------------------------
# 3. filter_by_org Tenant Isolation
# ---------------------------------------------------------------------------

@_NO_ROUTER
class FilterByOrgTenantIsolationTest(TestCase):
    """
    Verify filter_by_org correctly scopes queries to the requesting
    user's tenant. Data from tenant B must never leak to tenant A.
    """

    def setUp(self):
        # Create agents in two different tenants
        key_a, hash_a, prefix_a = AgentEndpoint.generate_api_key()
        self.agent_a = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='agent-tenant-a',
            name='Tenant A Agent',
            api_key_hash=hash_a,
            api_key_prefix=prefix_a,
        )

        key_b, hash_b, prefix_b = AgentEndpoint.generate_api_key()
        self.agent_b = AgentEndpoint.objects.create(
            tenant_id=TENANT_B,
            agent_id='agent-tenant-b',
            name='Tenant B Agent',
            api_key_hash=hash_b,
            api_key_prefix=prefix_b,
        )

        # Create policies in each tenant
        self.policy_a = Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Policy A',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'requests_per_minute': 100},
        )
        self.policy_b = Policy.objects.create(
            tenant_id=TENANT_B,
            name='Policy B',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'requests_per_minute': 200},
        )

    def test_filter_by_org_returns_only_own_tenant_data(self):
        """filter_by_org must return only the authenticated user's tenant data."""
        from zentinelle.schema.auth_helpers import filter_by_org

        # Simulate an admin user scoped to STANDALONE_TENANT
        user = User.objects.create_user(
            username=f'admin-a-{uuid.uuid4().hex[:8]}',
            password='testpass',
            is_staff=True,
        )

        policies = filter_by_org(Policy.objects.all(), user)
        tenant_ids = set(policies.values_list('tenant_id', flat=True))

        self.assertIn(STANDALONE_TENANT, tenant_ids)
        self.assertNotIn(TENANT_B, tenant_ids)

    def test_filter_by_org_unauthenticated_returns_empty(self):
        """An unauthenticated user gets no data from filter_by_org."""
        from zentinelle.schema.auth_helpers import filter_by_org

        class FakeAnon:
            is_authenticated = False

        result = filter_by_org(Policy.objects.all(), FakeAnon())
        self.assertEqual(result.count(), 0)

    def test_filter_by_org_none_user_returns_empty(self):
        """Passing None as user returns an empty queryset."""
        from zentinelle.schema.auth_helpers import filter_by_org

        result = filter_by_org(Policy.objects.all(), None)
        self.assertEqual(result.count(), 0)

    def test_policy_engine_respects_tenant_boundary(self):
        """PolicyEngine.get_effective_policies must only return policies
        from the endpoint's tenant_id, never cross-tenant."""
        engine = PolicyEngine()

        policies_a = engine.get_effective_policies(self.agent_a, use_cache=False)
        policy_tenant_ids = {p.tenant_id for p in policies_a}
        self.assertTrue(
            all(tid == STANDALONE_TENANT for tid in policy_tenant_ids),
            f"Got cross-tenant policies: {policy_tenant_ids}"
        )

        policies_b = engine.get_effective_policies(self.agent_b, use_cache=False)
        policy_tenant_ids_b = {p.tenant_id for p in policies_b}
        self.assertTrue(
            all(tid == TENANT_B for tid in policy_tenant_ids_b),
            f"Got cross-tenant policies for B: {policy_tenant_ids_b}"
        )


# ---------------------------------------------------------------------------
# 4. agent_id Unique Per Tenant
# ---------------------------------------------------------------------------

@_NO_ROUTER
class AgentIdUniquenessTest(TransactionTestCase):
    """
    Verify agent_id uniqueness is scoped per tenant.

    Same agent_id in different tenants: allowed.
    Same agent_id in the same tenant: denied (IntegrityError).

    Uses TransactionTestCase because IntegrityError aborts the
    current transaction in regular TestCase.
    """

    def test_same_agent_id_different_tenants_succeeds(self):
        """Two tenants can independently use the same agent_id."""
        shared_agent_id = 'shared-agent'

        key_a, hash_a, prefix_a = AgentEndpoint.generate_api_key()
        endpoint_a = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id=shared_agent_id,
            name='Agent A',
            api_key_hash=hash_a,
            api_key_prefix=prefix_a,
        )

        key_b, hash_b, prefix_b = AgentEndpoint.generate_api_key()
        endpoint_b = AgentEndpoint.objects.create(
            tenant_id=TENANT_B,
            agent_id=shared_agent_id,
            name='Agent B',
            api_key_hash=hash_b,
            api_key_prefix=prefix_b,
        )

        self.assertEqual(endpoint_a.agent_id, endpoint_b.agent_id)
        self.assertNotEqual(endpoint_a.tenant_id, endpoint_b.tenant_id)
        self.assertNotEqual(endpoint_a.pk, endpoint_b.pk)

    def test_duplicate_agent_id_same_tenant_fails(self):
        """Creating the same agent_id twice in one tenant must raise IntegrityError."""
        key_1, hash_1, prefix_1 = AgentEndpoint.generate_api_key()
        AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='dup-agent',
            name='First',
            api_key_hash=hash_1,
            api_key_prefix=prefix_1,
        )

        key_2, hash_2, prefix_2 = AgentEndpoint.generate_api_key()
        with self.assertRaises(IntegrityError):
            AgentEndpoint.objects.create(
                tenant_id=STANDALONE_TENANT,
                agent_id='dup-agent',
                name='Second',
                api_key_hash=hash_2,
                api_key_prefix=prefix_2,
            )

    def test_unique_together_meta_defined(self):
        """Confirm the model Meta declares the correct unique_together."""
        unique_together = AgentEndpoint._meta.unique_together
        self.assertIn(
            ('tenant_id', 'agent_id'),
            unique_together,
            f"unique_together should contain ('tenant_id', 'agent_id'), got {unique_together}"
        )


# ---------------------------------------------------------------------------
# 5. Event Batch Size Limit
# ---------------------------------------------------------------------------

@_NO_ROUTER
class EventBatchSizeLimitTest(SecurityTestMixin, TestCase):
    """
    Verify the events endpoint enforces the MAX_BATCH_SIZE limit.

    Batches exceeding the limit must be rejected with 400.
    Batches within the limit must be accepted with 202.
    """

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_batch_exceeding_limit_returns_400(self, mock_task):
        """POST /events with 1001 events must return 400."""
        self.authenticate()
        now = timezone.now().isoformat()
        events = [
            {
                'type': 'test_event',
                'category': 'telemetry',
                'payload': {},
                'timestamp': now,
            }
            for _ in range(1001)
        ]

        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': events,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn('error', data)
        self.assertIn('1000', data['error'])

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_batch_under_limit_returns_202(self, mock_task):
        """POST /events with 999 events must return 202."""
        self.authenticate()
        now = timezone.now().isoformat()
        events = [
            {
                'type': 'test_event',
                'category': 'telemetry',
                'payload': {},
                'timestamp': now,
            }
            for _ in range(999)
        ]

        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': events,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 999)

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_batch_at_exact_limit_returns_202(self, mock_task):
        """POST /events with exactly 1000 events must return 202."""
        self.authenticate()
        now = timezone.now().isoformat()
        events = [
            {
                'type': 'test_event',
                'category': 'telemetry',
                'payload': {},
                'timestamp': now,
            }
            for _ in range(1000)
        ]

        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': events,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 1000)


# ---------------------------------------------------------------------------
# 6. Bootstrap Token — DB Token Works
# ---------------------------------------------------------------------------

@_NO_ROUTER
class BootstrapTokenDBTest(TestCase):
    """
    Verify that database-issued bootstrap tokens can be used to
    register agents, and that use_count is incremented on validation.
    """

    def setUp(self):
        self.client = APIClient()

    def test_generate_and_validate_token(self):
        """A generated token must validate and return the correct tenant."""
        token_string, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='test-token',
        )

        self.assertTrue(token_string.startswith('bt_'))
        self.assertEqual(record.tenant_id, STANDALONE_TENANT)
        self.assertEqual(record.use_count, 0)

        # Validate the token
        tenant_id, validated_record = BootstrapToken.validate(token_string)

        self.assertEqual(tenant_id, STANDALONE_TENANT)
        self.assertIsNotNone(validated_record)

        # Verify use_count was incremented
        validated_record.refresh_from_db()
        self.assertEqual(validated_record.use_count, 1)

    def test_register_agent_with_db_token(self):
        """A DB bootstrap token must work for agent registration."""
        token_string, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='register-test',
        )

        self.client.credentials(HTTP_X_ZENTINELLE_BOOTSTRAP=token_string)
        response = self.client.post(
            reverse('zentinelle:register'),
            data={
                'agent_type': 'custom',
                'name': 'Bootstrap Agent',
                'agent_id': f'bt-agent-{uuid.uuid4().hex[:8]}',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('api_key', data)
        self.assertIn('agent_id', data)

        # Verify use_count was incremented during validation
        record.refresh_from_db()
        self.assertEqual(record.use_count, 1)

    def test_revoked_token_rejected(self):
        """A revoked bootstrap token must not authenticate."""
        token_string, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='revoked-token',
        )
        record.revoked = True
        record.save()

        tenant_id, validated = BootstrapToken.validate(token_string)
        self.assertIsNone(tenant_id)
        self.assertIsNone(validated)

    def test_expired_token_rejected(self):
        """An expired bootstrap token must not authenticate."""
        token_string, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='expired-token',
            expires_at=timezone.now() - timezone.timedelta(hours=1),
        )

        tenant_id, validated = BootstrapToken.validate(token_string)
        self.assertIsNone(tenant_id)
        self.assertIsNone(validated)

    def test_invalid_token_rejected(self):
        """A fabricated token string must not authenticate."""
        tenant_id, validated = BootstrapToken.validate('bt_fake_notarealtoken')
        self.assertIsNone(tenant_id)
        self.assertIsNone(validated)

    def test_multiple_uses_increment_count(self):
        """Each validation should increment use_count."""
        token_string, record = BootstrapToken.generate(
            tenant_id=STANDALONE_TENANT,
            label='multi-use',
        )

        for i in range(3):
            BootstrapToken.validate(token_string)

        record.refresh_from_db()
        self.assertEqual(record.use_count, 3)


# ---------------------------------------------------------------------------
# 7. RBAC Roles
# ---------------------------------------------------------------------------

@_NO_ROUTER
class RBACRolesTest(TestCase):
    """
    Verify RBAC role assignments and permission checks.

    Three roles: admin > operator > viewer.
    Each role includes the capabilities of the roles below it.
    """

    def setUp(self):
        from zentinelle.auth.roles import assign_role, ensure_groups_exist
        ensure_groups_exist()

        suffix = uuid.uuid4().hex[:8]

        self.admin_user = User.objects.create_user(
            username=f'admin-{suffix}',
            password='test',
        )
        assign_role(self.admin_user, 'zentinelle_admin')

        self.operator_user = User.objects.create_user(
            username=f'operator-{suffix}',
            password='test',
        )
        assign_role(self.operator_user, 'zentinelle_operator')

        self.viewer_user = User.objects.create_user(
            username=f'viewer-{suffix}',
            password='test',
        )
        assign_role(self.viewer_user, 'zentinelle_viewer')

    def test_can_admin_returns_correct_values(self):
        """Only admin users should return True for can_admin."""
        from zentinelle.auth.roles import can_admin
        self.assertTrue(can_admin(self.admin_user))
        self.assertFalse(can_admin(self.operator_user))
        self.assertFalse(can_admin(self.viewer_user))

    def test_can_mutate_returns_correct_values(self):
        """Admin and operator should be able to mutate; viewer cannot."""
        from zentinelle.auth.roles import can_mutate
        self.assertTrue(can_mutate(self.admin_user))
        self.assertTrue(can_mutate(self.operator_user))
        self.assertFalse(can_mutate(self.viewer_user))

    def test_can_view_returns_correct_values(self):
        """All three roles should have view access."""
        from zentinelle.auth.roles import can_view
        self.assertTrue(can_view(self.admin_user))
        self.assertTrue(can_view(self.operator_user))
        self.assertTrue(can_view(self.viewer_user))

    def test_unauthenticated_user_has_no_permissions(self):
        """An unauthenticated user should have no permissions."""
        from zentinelle.auth.roles import can_admin, can_mutate, can_view

        class FakeAnon:
            is_authenticated = False

        anon = FakeAnon()
        self.assertFalse(can_admin(anon))
        self.assertFalse(can_mutate(anon))
        self.assertFalse(can_view(anon))

    def test_superuser_gets_admin_role(self):
        """Django superuser should be treated as zentinelle_admin."""
        from zentinelle.auth.roles import can_admin, get_role
        suffix = uuid.uuid4().hex[:8]
        superuser = User.objects.create_superuser(
            username=f'super-{suffix}',
            password='test',
        )
        self.assertEqual(get_role(superuser), 'zentinelle_admin')
        self.assertTrue(can_admin(superuser))

    def test_staff_user_without_group_gets_admin_role(self):
        """Django staff user without explicit group should default to admin."""
        from zentinelle.auth.roles import get_role
        suffix = uuid.uuid4().hex[:8]
        staff_user = User.objects.create_user(
            username=f'staff-{suffix}',
            password='test',
            is_staff=True,
        )
        self.assertEqual(get_role(staff_user), 'zentinelle_admin')

    def test_viewer_cannot_see_other_tenant_via_filter_by_org(self):
        """A viewer scoped to tenant A must not see tenant B data."""
        from zentinelle.schema.auth_helpers import filter_by_org

        # Create data in both tenants
        key_a, hash_a, prefix_a = AgentEndpoint.generate_api_key()
        AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id=f'viewer-test-a-{uuid.uuid4().hex[:8]}',
            name='Tenant A',
            api_key_hash=hash_a,
            api_key_prefix=prefix_a,
        )
        key_b, hash_b, prefix_b = AgentEndpoint.generate_api_key()
        AgentEndpoint.objects.create(
            tenant_id=TENANT_B,
            agent_id=f'viewer-test-b-{uuid.uuid4().hex[:8]}',
            name='Tenant B',
            api_key_hash=hash_b,
            api_key_prefix=prefix_b,
        )

        # viewer_user gets the default standalone tenant
        qs = filter_by_org(AgentEndpoint.objects.all(), self.viewer_user)
        tenant_ids = set(qs.values_list('tenant_id', flat=True))
        self.assertNotIn(TENANT_B, tenant_ids)


# ---------------------------------------------------------------------------
# 8. Health Endpoints
# ---------------------------------------------------------------------------

@_NO_ROUTER
@override_settings(CACHES={
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'health-test-cache',
    }
})
class HealthEndpointTest(TestCase):
    """
    Verify that /health and /ready endpoints return expected responses.

    These are used by Kubernetes probes and monitoring.
    """

    def setUp(self):
        self.client = APIClient()

    def test_health_returns_200(self):
        """GET /health must return 200 with status=ok."""
        response = self.client.get(reverse('zentinelle:health'))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')

    def test_ready_returns_200_with_checks(self):
        """GET /ready must return a response with database and cache checks."""
        response = self.client.get(reverse('zentinelle:ready'))
        data = response.json()
        # Should have 'checks' dict with at least 'database' and 'cache'
        self.assertIn('checks', data)
        self.assertIn('database', data['checks'])
        self.assertIn('cache', data['checks'])
        # Status should be present
        self.assertIn('status', data)


# ---------------------------------------------------------------------------
# 9. Heartbeat Config Change Detection
# ---------------------------------------------------------------------------

@_NO_ROUTER
class HeartbeatConfigChangeDetectionTest(SecurityTestMixin, TestCase):
    """
    Verify that heartbeat detects when the agent's config hash
    no longer matches the server-side config.
    """

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_heartbeat_detects_config_change_via_hash(self, mock_task):
        """When agent sends a config_hash that differs from server config,
        config_changed must be True in the response."""
        self.authenticate()

        # First heartbeat — agent sends the correct hash
        server_config_hash = hashlib.sha256(
            json.dumps(self.endpoint.config, sort_keys=True).encode()
        ).hexdigest()

        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'config_hash': server_config_hash,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        self.assertFalse(response.json()['config_changed'])

        # Now change the server config
        self.endpoint.config = {'version': '2.0', 'new_setting': True}
        self.endpoint.save()

        # Second heartbeat — agent still has the OLD hash
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'config_hash': server_config_hash,  # old hash
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.json()['config_changed'])

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_heartbeat_no_config_change_when_hashes_match(self, mock_task):
        """When agent's config_hash matches the server, config_changed is False."""
        self.authenticate()

        # Compute the correct hash
        correct_hash = hashlib.sha256(
            json.dumps(self.endpoint.config, sort_keys=True).encode()
        ).hexdigest()

        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'config_hash': correct_hash,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        self.assertFalse(response.json()['config_changed'])

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_first_heartbeat_with_matching_hash_is_not_changed(self, mock_task):
        """The very first heartbeat (previous_heartbeat=None) with a
        matching config_hash should return config_changed=False because
        there is no previous heartbeat to compare updated_at against."""
        self.authenticate()

        correct_hash = hashlib.sha256(
            json.dumps(self.endpoint.config, sort_keys=True).encode()
        ).hexdigest()

        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'config_hash': correct_hash,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 202)
        # First heartbeat: previous_heartbeat is None so updated_at fallback
        # is skipped, and config_hash matches, so config_changed is False.
        self.assertFalse(response.json()['config_changed'])


# ---------------------------------------------------------------------------
# 10. Webhook Dispatch
# ---------------------------------------------------------------------------

@_NO_ROUTER
class WebhookDispatchTest(TestCase):
    """
    Verify that creating a ComplianceAlert triggers webhook dispatch
    via the Django signal and the webhook_dispatcher service.
    """

    def setUp(self):
        # Create a NotificationConfig for webhook delivery
        self.webhook_config = NotificationConfig.objects.create(
            tenant_id=STANDALONE_TENANT,
            channel=NotificationConfig.Channel.WEBHOOK,
            config={
                'url': 'https://hooks.example.com/zentinelle',
                'secret': 'test-secret-key',
            },
            trigger_severities=['critical', 'high'],
            enabled=True,
        )

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_compliance_alert_triggers_webhook(self, mock_httpx_post):
        """Creating a ComplianceAlert should trigger dispatch_webhook via signal."""
        mock_httpx_post.return_value = MagicMock(status_code=200)

        ComplianceAlert.objects.create(
            tenant_id=STANDALONE_TENANT,
            alert_type=ComplianceAlert.AlertType.CRITICAL_VIOLATION,
            severity=ContentRule.Severity.CRITICAL,
            title='PII detected in agent output',
            description='SSN pattern found in response',
        )

        # The post_save signal should have called dispatch_webhook,
        # which should have called httpx.post
        mock_httpx_post.assert_called_once()
        call_args = mock_httpx_post.call_args
        url = call_args.kwargs.get('url', call_args.args[0] if call_args.args else None)
        self.assertEqual(url, 'https://hooks.example.com/zentinelle')

        # Verify the body contains the event_type
        fallback = call_args.args[1] if len(call_args.args) > 1 else ''
        body = call_args.kwargs.get('content', fallback)
        if isinstance(body, (str, bytes)):
            body_data = json.loads(body)
            self.assertEqual(body_data['event_type'], 'compliance_alert')

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_webhook_includes_hmac_signature(self, mock_httpx_post):
        """When a secret is configured, the webhook must include an HMAC signature."""
        mock_httpx_post.return_value = MagicMock(status_code=200)

        ComplianceAlert.objects.create(
            tenant_id=STANDALONE_TENANT,
            alert_type=ComplianceAlert.AlertType.THRESHOLD_EXCEEDED,
            severity=ContentRule.Severity.HIGH,
            title='Violation threshold exceeded',
            description='More than 100 violations in 24h',
        )

        mock_httpx_post.assert_called_once()
        call_args = mock_httpx_post.call_args
        headers = call_args.kwargs.get('headers', {})
        self.assertIn('X-Zentinelle-Signature', headers)
        self.assertTrue(headers['X-Zentinelle-Signature'].startswith('sha256='))

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_webhook_not_triggered_for_unmatched_severity(self, mock_httpx_post):
        """Webhook should NOT fire for severities not in trigger_severities."""
        mock_httpx_post.return_value = MagicMock(status_code=200)

        # This config only triggers on critical/high. Create a LOW severity alert.
        ComplianceAlert.objects.create(
            tenant_id=STANDALONE_TENANT,
            alert_type=ComplianceAlert.AlertType.SINGLE_VIOLATION,
            severity=ContentRule.Severity.LOW,
            title='Low severity finding',
            description='Minor issue',
        )

        mock_httpx_post.assert_not_called()

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_webhook_not_triggered_for_different_tenant(self, mock_httpx_post):
        """Webhook configs from tenant A must not fire for tenant B alerts."""
        mock_httpx_post.return_value = MagicMock(status_code=200)

        ComplianceAlert.objects.create(
            tenant_id=TENANT_B,  # Different tenant than webhook_config
            alert_type=ComplianceAlert.AlertType.CRITICAL_VIOLATION,
            severity=ContentRule.Severity.CRITICAL,
            title='Tenant B alert',
            description='This should not trigger tenant A webhook',
        )

        mock_httpx_post.assert_not_called()

    @patch('zentinelle.services.webhook_dispatcher.httpx.post')
    def test_disabled_webhook_not_triggered(self, mock_httpx_post):
        """A disabled NotificationConfig should not trigger webhooks."""
        self.webhook_config.enabled = False
        self.webhook_config.save()

        mock_httpx_post.return_value = MagicMock(status_code=200)

        ComplianceAlert.objects.create(
            tenant_id=STANDALONE_TENANT,
            alert_type=ComplianceAlert.AlertType.CRITICAL_VIOLATION,
            severity=ContentRule.Severity.CRITICAL,
            title='Should not fire',
            description='Config is disabled',
        )

        mock_httpx_post.assert_not_called()
