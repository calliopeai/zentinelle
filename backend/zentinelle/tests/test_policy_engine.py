"""
Tests for the Policy Engine service.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch, MagicMock

from organization.models import Organization, SubOrganization
from deployments.models import Deployment
from zentinelle.models import (
    AgentEndpoint,
    Policy,
)
from zentinelle.services.policy_engine import (
    PolicyEngine,
    PolicyResult,
    EvaluationResult,
)

User = get_user_model()


class PolicyEngineTest(TestCase):
    """Tests for PolicyEngine service."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

        # Create endpoint
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent',
            name='Test Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )

        self.engine = PolicyEngine()

    def test_get_effective_policies_empty(self):
        """Test getting policies when none exist."""
        policies = self.engine.get_effective_policies(self.endpoint)
        self.assertEqual(len(policies), 0)

    def test_get_effective_policies_org_level(self):
        """Test organization-level policies."""
        policy = Policy.objects.create(
            organization=self.org,
            name='Org Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 100},
            created_by=self.user,
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)
        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].id, policy.id)

    def test_policy_inheritance_more_specific_wins(self):
        """Test that more specific scope overrides broader scope."""
        # Org-level policy
        org_policy = Policy.objects.create(
            organization=self.org,
            name='Org Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 100},
        )

        # Endpoint-specific policy (more specific)
        endpoint_policy = Policy.objects.create(
            organization=self.org,
            name='Endpoint Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ENDPOINT,
            scope_endpoint=self.endpoint,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 50},
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)

        # Should get endpoint policy, not org policy
        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].id, endpoint_policy.id)
        self.assertEqual(policies[0].config['requests_per_minute'], 50)

    def test_policy_inheritance_with_deployment(self):
        """Test policy inheritance through deployment scope."""
        deployment = Deployment.objects.create(
            organization=self.org,
            name='Production',
            deployment_type=Deployment.DeploymentType.JUNOHUB,
            hosting_model=Deployment.HostingModel.MANAGED_ECS,
        )
        self.endpoint.deployment = deployment
        self.endpoint.save()

        # Org-level policy
        Policy.objects.create(
            organization=self.org,
            name='Org Resource Quota',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'max_servers': 100},
        )

        # Deployment-specific policy
        deploy_policy = Policy.objects.create(
            organization=self.org,
            name='Deploy Resource Quota',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.DEPLOYMENT,
            scope_deployment=deployment,
            config={'max_servers': 20},
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)

        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].id, deploy_policy.id)

    def test_multiple_policy_types(self):
        """Test getting multiple policy types."""
        Policy.objects.create(
            organization=self.org,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'requests_per_minute': 100},
        )
        Policy.objects.create(
            organization=self.org,
            name='Resource Quota',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'max_servers': 10},
        )
        Policy.objects.create(
            organization=self.org,
            name='Budget Limit',
            policy_type=Policy.PolicyType.BUDGET_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={'daily_limit_usd': 100},
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)
        self.assertEqual(len(policies), 3)

        policy_types = {p.policy_type for p in policies}
        self.assertIn(Policy.PolicyType.RATE_LIMIT, policy_types)
        self.assertIn(Policy.PolicyType.RESOURCE_QUOTA, policy_types)
        self.assertIn(Policy.PolicyType.BUDGET_LIMIT, policy_types)

    def test_filter_by_policy_types(self):
        """Test filtering by specific policy types."""
        Policy.objects.create(
            organization=self.org,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={},
        )
        Policy.objects.create(
            organization=self.org,
            name='Resource Quota',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={},
        )

        policies = self.engine.get_effective_policies(
            self.endpoint,
            policy_types=[Policy.PolicyType.RATE_LIMIT],
            use_cache=False,
        )

        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].policy_type, Policy.PolicyType.RATE_LIMIT)

    def test_disabled_policies_not_included(self):
        """Test that disabled policies are filtered out."""
        Policy.objects.create(
            organization=self.org,
            name='Enabled Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enabled=True,
            config={},
        )
        Policy.objects.create(
            organization=self.org,
            name='Disabled Policy',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enabled=False,
            config={},
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)
        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].name, 'Enabled Policy')

    def test_priority_ordering(self):
        """Test that higher priority policies win within same scope."""
        Policy.objects.create(
            organization=self.org,
            name='Low Priority',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            priority=1,
            config={'requests_per_minute': 50},
        )
        high_priority = Policy.objects.create(
            organization=self.org,
            name='High Priority',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            priority=10,
            config={'requests_per_minute': 100},
        )

        policies = self.engine.get_effective_policies(self.endpoint, use_cache=False)
        self.assertEqual(len(policies), 1)
        self.assertEqual(policies[0].id, high_priority.id)


class PolicyEvaluationTest(TestCase):
    """Tests for policy evaluation."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent',
            name='Test Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )
        self.engine = PolicyEngine()

    def test_evaluate_no_policies(self):
        """Test evaluation when no policies exist."""
        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
            user_id='user123',
        )

        self.assertTrue(result.allowed)
        self.assertIsNone(result.reason)
        self.assertEqual(len(result.policies_evaluated), 0)

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_evaluate_policy_pass(self, mock_get_evaluator):
        """Test evaluation when policy passes."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = PolicyResult(passed=True)
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            organization=self.org,
            name='Test Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
            user_id='user123',
        )

        self.assertTrue(result.allowed)
        self.assertEqual(len(result.policies_evaluated), 1)
        self.assertEqual(result.policies_evaluated[0]['result'], 'pass')

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_evaluate_policy_fail_enforce(self, mock_get_evaluator):
        """Test evaluation when enforced policy fails."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = PolicyResult(
            passed=False,
            message='Rate limit exceeded'
        )
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            organization=self.org,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
            user_id='user123',
        )

        self.assertFalse(result.allowed)
        self.assertEqual(result.reason, 'Rate limit exceeded')
        self.assertEqual(result.policies_evaluated[0]['result'], 'fail')

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_evaluate_policy_fail_audit_only(self, mock_get_evaluator):
        """Test evaluation when audit-only policy fails (should still allow)."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = PolicyResult(
            passed=False,
            message='Would exceed rate limit'
        )
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            organization=self.org,
            name='Rate Limit Audit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.AUDIT,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
            user_id='user123',
        )

        self.assertTrue(result.allowed)  # Still allowed in audit mode
        self.assertIn('[Audit]', result.warnings[0])

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_evaluate_disabled_enforcement_skipped(self, mock_get_evaluator):
        """Test that disabled enforcement policies are skipped."""
        mock_evaluator = MagicMock()
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            organization=self.org,
            name='Disabled Enforcement',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.DISABLED,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
        )

        # Evaluator should not be called
        mock_evaluator.evaluate.assert_not_called()
        self.assertTrue(result.allowed)

    @patch('zentinelle.services.policy_engine.PolicyEngine._get_evaluator')
    def test_evaluate_with_warnings(self, mock_get_evaluator):
        """Test evaluation returns warnings."""
        mock_evaluator = MagicMock()
        mock_evaluator.evaluate.return_value = PolicyResult(
            passed=True,
            warnings=['Approaching rate limit threshold']
        )
        mock_get_evaluator.return_value = mock_evaluator

        Policy.objects.create(
            organization=self.org,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={},
        )

        result = self.engine.evaluate(
            endpoint=self.endpoint,
            action='spawn',
        )

        self.assertTrue(result.allowed)
        self.assertIn('Approaching rate limit threshold', result.warnings)


class PolicyMergingTest(TestCase):
    """Tests for policy merging logic."""

    def setUp(self):
        self.engine = PolicyEngine()

    def test_merge_empty_layers(self):
        """Test merging with empty layers."""
        result = self.engine._merge_policies([[], [], []])
        self.assertEqual(len(result), 0)

    def test_merge_single_layer(self):
        """Test merging with single layer."""
        org = Organization.objects.create(name="Test")
        policy = Policy(
            organization=org,
            name='Test',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            priority=1,
        )

        result = self.engine._merge_policies([[policy]])
        self.assertEqual(len(result), 1)

    def test_merge_later_layer_overrides(self):
        """Test that later layers override earlier ones."""
        org = Organization.objects.create(name="Test")

        org_policy = Policy(
            organization=org,
            name='Org Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            priority=1,
            config={'limit': 100},
        )

        endpoint_policy = Policy(
            organization=org,
            name='Endpoint Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ENDPOINT,
            priority=1,
            config={'limit': 50},
        )

        result = self.engine._merge_policies([
            [org_policy],  # Layer 1 (org)
            [endpoint_policy],  # Layer 2 (endpoint)
        ])

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].name, 'Endpoint Policy')
