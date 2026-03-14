"""
Tests for Zentinelle models.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch, MagicMock

from organization.models import Organization
from deployments.models import Deployment
from zentinelle.models import (
    AgentEndpoint,
    Policy,
    Event,
    ContentRule,
    ContentScan,
    ContentViolation,
    ComplianceAlert,
    License,
)

User = get_user_model()


class AgentEndpointModelTest(TestCase):
    """Tests for AgentEndpoint model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")

    def test_generate_api_key_format(self):
        """Test API key generation format."""
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        # Check format
        self.assertTrue(full_key.startswith('sk_agent_'))
        self.assertEqual(len(key_prefix), 12)
        self.assertEqual(key_prefix, full_key[:12])

        # Check hash is bcrypt format
        self.assertTrue(key_hash.startswith('$2b$'))

    def test_verify_api_key_valid(self):
        """Test API key verification with valid key."""
        full_key, key_hash, _ = AgentEndpoint.generate_api_key()
        self.assertTrue(AgentEndpoint.verify_api_key(full_key, key_hash))

    def test_verify_api_key_invalid(self):
        """Test API key verification with invalid key."""
        _, key_hash, _ = AgentEndpoint.generate_api_key()
        self.assertFalse(AgentEndpoint.verify_api_key('wrong_key', key_hash))

    def test_create_endpoint(self):
        """Test creating an agent endpoint."""
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent-001',
            name='Test Agent',
            agent_type=AgentEndpoint.AgentType.JUPYTERHUB,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )

        self.assertEqual(endpoint.agent_id, 'test-agent-001')
        self.assertEqual(endpoint.status, AgentEndpoint.Status.ACTIVE)
        self.assertEqual(endpoint.health, AgentEndpoint.Health.UNKNOWN)

    def test_rotate_api_key(self):
        """Test API key rotation."""
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent-002',
            name='Test Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )

        old_hash = endpoint.api_key_hash
        new_key = endpoint.rotate_api_key()

        # New key should be different
        self.assertNotEqual(endpoint.api_key_hash, old_hash)
        self.assertTrue(new_key.startswith('sk_agent_'))

        # New key should verify
        self.assertTrue(AgentEndpoint.verify_api_key(new_key, endpoint.api_key_hash))

    def test_update_heartbeat(self):
        """Test heartbeat update."""
        full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()

        endpoint = AgentEndpoint.objects.create(
            organization=self.org,
            agent_id='test-agent-003',
            name='Test Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )

        self.assertIsNone(endpoint.last_heartbeat)

        endpoint.update_heartbeat(health='healthy')

        self.assertIsNotNone(endpoint.last_heartbeat)
        self.assertEqual(endpoint.health, AgentEndpoint.Health.HEALTHY)


class PolicyModelTest(TestCase):
    """Tests for Policy model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

    def test_create_policy(self):
        """Test creating a policy."""
        policy = Policy.objects.create(
            organization=self.org,
            name='Resource Quota',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'max_servers': 10, 'max_memory_gb': 32},
            created_by=self.user,
        )

        self.assertEqual(policy.name, 'Resource Quota')
        self.assertTrue(policy.enabled)
        self.assertEqual(policy.priority, 0)

    def test_policy_scope_types(self):
        """Test different policy scope types."""
        # Note: SUB_ORGANIZATION scope requires sub_organization to be set
        # and DEPLOYMENT/ENDPOINT/USER scopes require their respective objects
        # We only test ORGANIZATION scope here; other scopes tested separately
        policy = Policy.objects.create(
            organization=self.org,
            name='Org Policy',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={},
        )
        self.assertEqual(policy.scope_type, Policy.ScopeType.ORGANIZATION)


class DeploymentModelTest(TestCase):
    """Tests for Deployment model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.license = License.objects.create(
            organization=self.org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            billing_model=License.BillingModel.PER_USER,
            max_deployments=10,
            max_agents=100,
            max_users=50,
        )

    def test_create_deployment(self):
        """Test creating a deployment."""
        deployment = Deployment.objects.create(
            organization=self.org,
            license=self.license,
            name='Production JunoHub',
            deployment_type=Deployment.DeploymentType.JUNOHUB,
            hosting_model=Deployment.HostingModel.MANAGED_ECS,
            status=Deployment.Status.ACTIVE,
        )

        self.assertEqual(deployment.name, 'Production JunoHub')
        self.assertEqual(deployment.hosting_model, Deployment.HostingModel.MANAGED_ECS)

    def test_deployment_hosting_models(self):
        """Test different hosting models."""
        hosting_models = [
            Deployment.HostingModel.MANAGED_ECS,
            Deployment.HostingModel.BYOC_AWS,
            Deployment.HostingModel.ONPREM_DOCKER,
        ]

        for hosting_model in hosting_models:
            deployment = Deployment.objects.create(
                organization=self.org,
                license=self.license,
                name=f'Deploy {hosting_model}',
                deployment_type=Deployment.DeploymentType.JUNOHUB,
                hosting_model=hosting_model,
            )
            self.assertEqual(deployment.hosting_model, hosting_model)


class ContentRuleModelTest(TestCase):
    """Tests for ContentRule model."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")

    def test_create_secret_detection_rule(self):
        """Test creating a secret detection rule."""
        rule = ContentRule.objects.create(
            organization=self.org,
            name='AWS Key Detection',
            rule_type=ContentRule.RuleType.SECRET_DETECTION,
            severity=ContentRule.Severity.CRITICAL,
            enforcement=ContentRule.Enforcement.BLOCK,
            config={
                'detect_aws_keys': True,
                'detect_api_keys': True,
            },
        )

        self.assertEqual(rule.rule_type, ContentRule.RuleType.SECRET_DETECTION)
        self.assertEqual(rule.severity, ContentRule.Severity.CRITICAL)
        self.assertTrue(rule.enabled)

    def test_create_pii_detection_rule(self):
        """Test creating a PII detection rule."""
        rule = ContentRule.objects.create(
            organization=self.org,
            name='PII Detection',
            rule_type=ContentRule.RuleType.PII_DETECTION,
            severity=ContentRule.Severity.HIGH,
            enforcement=ContentRule.Enforcement.REDACT,
            config={
                'detect_ssn': True,
                'detect_credit_cards': True,
                'detect_emails': True,
            },
        )

        self.assertEqual(rule.rule_type, ContentRule.RuleType.PII_DETECTION)
        self.assertEqual(rule.enforcement, ContentRule.Enforcement.REDACT)

    def test_rule_scan_modes(self):
        """Test different scan modes."""
        modes = [
            ContentRule.ScanMode.REALTIME,
            ContentRule.ScanMode.ASYNC,
            ContentRule.ScanMode.BOTH,
        ]

        for mode in modes:
            rule = ContentRule.objects.create(
                organization=self.org,
                name=f'Rule {mode}',
                rule_type=ContentRule.RuleType.CUSTOM_PATTERN,
                scan_mode=mode,
                config={'patterns': []},
            )
            self.assertEqual(rule.scan_mode, mode)


class EventModelTest(TestCase):
    """Tests for Event model."""

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

    def test_create_telemetry_event(self):
        """Test creating a telemetry event."""
        from django.utils import timezone
        event = Event.objects.create(
            organization=self.org,
            endpoint=self.endpoint,
            event_type='spawn',
            event_category=Event.Category.TELEMETRY,
            payload={'user_id': 'user123', 'service': 'lab'},
            occurred_at=timezone.now(),
        )

        self.assertEqual(event.event_type, 'spawn')
        self.assertEqual(event.event_category, Event.Category.TELEMETRY)
        self.assertEqual(event.status, Event.Status.PENDING)

    def test_create_audit_event(self):
        """Test creating an audit event."""
        from django.utils import timezone
        event = Event.objects.create(
            organization=self.org,
            endpoint=self.endpoint,
            event_type='policy_violation',
            event_category=Event.Category.AUDIT,
            payload={'policy': 'rate_limit', 'user': 'user456'},
            occurred_at=timezone.now(),
        )

        self.assertEqual(event.event_category, Event.Category.AUDIT)
