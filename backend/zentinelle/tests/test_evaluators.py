"""
Tests for the individual policy evaluators.

Issue: #23
"""
import pytest
from django.test import TestCase, override_settings
from django.core.cache import cache
from django.core import signing
from django.utils import timezone
from unittest.mock import patch, MagicMock
from datetime import timedelta

from organization.models import Organization
from zentinelle.models import Policy
from zentinelle.services.evaluators import (
    BasePolicyEvaluator,
    NoOpEvaluator,
    PolicyResult,
    RateLimitEvaluator,
    ResourceQuotaEvaluator,
    BudgetLimitEvaluator,
    ToolPermissionEvaluator,
    SecretAccessEvaluator,
)
from zentinelle.services.evaluators.tool_permission import create_tool_approval_token


class NoOpEvaluatorTest(TestCase):
    """Tests for NoOpEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = NoOpEvaluator()
        self.policy = Policy(
            organization=self.org,
            name='Test Policy',
            policy_type=Policy.PolicyType.SYSTEM_PROMPT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config={},
        )

    def test_always_passes(self):
        """NoOpEvaluator should always return passed=True."""
        result = self.evaluator.evaluate(
            self.policy,
            action='any_action',
            user_id='user123',
            context={'anything': 'goes'},
        )

        self.assertTrue(result.passed)
        self.assertIsNone(result.message)
        self.assertEqual(len(result.warnings), 0)


@override_settings(CACHES={
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'test-cache',
    }
})
class RateLimitEvaluatorTest(TestCase):
    """Tests for RateLimitEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = RateLimitEvaluator()
        cache.clear()

    def tearDown(self):
        cache.clear()

    def _create_policy(self, config):
        return Policy(
            organization=self.org,
            name='Rate Limit Policy',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config=config,
        )

    def test_rate_limit_pass_under_limit(self):
        """Test rate limit passes when under the limit."""
        policy = self._create_policy({'requests_per_minute': 100})

        result = self.evaluator.evaluate(
            policy,
            action='spawn',
            user_id='user123',
            context={'endpoint_id': 'endpoint1'},
        )

        self.assertTrue(result.passed)
        self.assertIsNone(result.message)

    def test_rate_limit_fail_over_limit(self):
        """Test rate limit fails when limit is exceeded."""
        policy = self._create_policy({'requests_per_minute': 5})
        context = {'endpoint_id': 'endpoint1'}

        # Make requests up to the limit
        for i in range(5):
            result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)
            self.assertTrue(result.passed)

        # Next request should fail
        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Rate limit exceeded', result.message)
        self.assertIn('5 requests per minute', result.message)

    def test_rate_limit_warning_at_threshold(self):
        """Test warning is returned when approaching rate limit."""
        policy = self._create_policy({'requests_per_minute': 10})
        context = {'endpoint_id': 'endpoint1'}

        # Make 8 requests (80% of limit)
        for i in range(8):
            result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('Approaching rate limit', result.warnings[0])

    def test_rate_limit_per_hour(self):
        """Test per-hour rate limit."""
        policy = self._create_policy({'requests_per_hour': 2})
        context = {'endpoint_id': 'endpoint1'}

        # First 2 requests pass
        self.evaluator.evaluate(policy, 'spawn', 'user123', context)
        self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        # Third request fails
        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('requests per hour', result.message)

    def test_token_limit_pass(self):
        """Test token limit passes when under the limit."""
        policy = self._create_policy({'tokens_per_day': 10000})
        context = {'endpoint_id': 'endpoint1', 'tokens': 100}

        result = self.evaluator.evaluate(policy, 'ai_request', 'user123', context)

        self.assertTrue(result.passed)

    def test_token_limit_fail_over_limit(self):
        """Test token limit fails when exceeded."""
        policy = self._create_policy({'tokens_per_day': 1000})
        context = {'endpoint_id': 'endpoint1', 'tokens': 500}

        # First request passes
        result = self.evaluator.evaluate(policy, 'ai_request', 'user123', context)
        self.assertTrue(result.passed)

        # Second request passes (1000 tokens total)
        result = self.evaluator.evaluate(policy, 'ai_request', 'user123', context)
        self.assertTrue(result.passed)

        # Third request fails (would exceed 1000)
        result = self.evaluator.evaluate(policy, 'ai_request', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Token limit exceeded', result.message)

    def test_token_limit_warning_at_threshold(self):
        """Test token limit warning when approaching limit."""
        policy = self._create_policy({'tokens_per_day': 1000})
        context = {'endpoint_id': 'endpoint1', 'tokens': 850}

        result = self.evaluator.evaluate(policy, 'ai_request', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('Approaching token limit', result.warnings[0])

    def test_token_limit_only_for_ai_requests(self):
        """Test token limit only applies to ai_request actions."""
        policy = self._create_policy({'tokens_per_day': 100})
        context = {'endpoint_id': 'endpoint1', 'tokens': 200}

        # Non-ai_request action should pass even with tokens specified
        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_rate_limit_separate_by_user(self):
        """Test rate limits are tracked separately per user."""
        policy = self._create_policy({'requests_per_minute': 2})
        context = {'endpoint_id': 'endpoint1'}

        # User 1 uses their limit
        self.evaluator.evaluate(policy, 'spawn', 'user1', context)
        self.evaluator.evaluate(policy, 'spawn', 'user1', context)

        # User 1 is now blocked
        result1 = self.evaluator.evaluate(policy, 'spawn', 'user1', context)
        self.assertFalse(result1.passed)

        # User 2 should still have their limit
        result2 = self.evaluator.evaluate(policy, 'spawn', 'user2', context)
        self.assertTrue(result2.passed)


class ResourceQuotaEvaluatorTest(TestCase):
    """Tests for ResourceQuotaEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = ResourceQuotaEvaluator()

    def _create_policy(self, config):
        return Policy(
            organization=self.org,
            name='Resource Quota Policy',
            policy_type=Policy.PolicyType.RESOURCE_QUOTA,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config=config,
        )

    def test_max_concurrent_servers_pass(self):
        """Test pass when under max concurrent servers."""
        policy = self._create_policy({'max_concurrent_servers': 10})
        context = {'current_server_count': 5}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_max_concurrent_servers_fail(self):
        """Test fail when at max concurrent servers."""
        policy = self._create_policy({'max_concurrent_servers': 5})
        context = {'current_server_count': 5}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Maximum concurrent servers', result.message)
        self.assertIn('5', result.message)

    def test_max_concurrent_servers_warning(self):
        """Test warning when approaching max concurrent servers."""
        policy = self._create_policy({'max_concurrent_servers': 5})
        context = {'current_server_count': 4}  # One away from limit

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('Approaching server limit', result.warnings[0])

    def test_allowed_instance_sizes_pass(self):
        """Test pass when requested instance size is allowed."""
        policy = self._create_policy({
            'allowed_instance_sizes': ['small', 'medium', 'large']
        })
        context = {'instance_size': 'medium'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_allowed_instance_sizes_fail(self):
        """Test fail when requested instance size is not allowed."""
        policy = self._create_policy({
            'allowed_instance_sizes': ['small', 'medium']
        })
        context = {'instance_size': 'xlarge'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('xlarge', result.message)
        self.assertIn('not allowed', result.message)

    def test_allowed_services_pass(self):
        """Test pass when requested service is allowed."""
        policy = self._create_policy({
            'allowed_services': ['lab', 'chat']
        })
        context = {'service': 'lab'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_allowed_services_fail(self):
        """Test fail when requested service is not allowed."""
        policy = self._create_policy({
            'allowed_services': ['lab']
        })
        context = {'service': 'compute'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('compute', result.message)
        self.assertIn('not allowed', result.message)

    def test_server_hours_limit_pass(self):
        """Test pass when under monthly server hours."""
        policy = self._create_policy({'max_server_hours_per_month': 100})
        context = {'server_hours_this_month': 50}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_server_hours_limit_fail(self):
        """Test fail when monthly server hours exceeded."""
        policy = self._create_policy({'max_server_hours_per_month': 100})
        context = {'server_hours_this_month': 100}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Monthly server hour limit', result.message)

    def test_server_hours_warning(self):
        """Test warning when approaching server hours limit."""
        policy = self._create_policy({'max_server_hours_per_month': 100})
        context = {'server_hours_this_month': 85}  # 85% of limit

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('Approaching monthly server hour limit', result.warnings[0])

    def test_non_spawn_action_skips_size_check(self):
        """Test that non-spawn actions don't check instance size."""
        policy = self._create_policy({
            'allowed_instance_sizes': ['small']
        })
        context = {'instance_size': 'xlarge'}

        # 'stop' action should not check instance size
        result = self.evaluator.evaluate(policy, 'stop', 'user123', context)

        self.assertTrue(result.passed)


class BudgetLimitEvaluatorTest(TestCase):
    """Tests for BudgetLimitEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = BudgetLimitEvaluator()

    def _create_policy(self, config):
        return Policy(
            organization=self.org,
            name='Budget Limit Policy',
            policy_type=Policy.PolicyType.BUDGET_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config=config,
        )

    def test_no_budget_configured_passes(self):
        """Test pass when no budget is configured."""
        policy = self._create_policy({})
        context = {'current_month_spend_usd': 1000}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_under_budget_passes(self):
        """Test pass when under budget."""
        policy = self._create_policy({'monthly_budget_usd': 500})
        context = {'current_month_spend_usd': 200}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_over_budget_hard_limit_fails(self):
        """Test fail when over budget with hard limit."""
        policy = self._create_policy({
            'monthly_budget_usd': 500,
            'hard_limit': True,
        })
        context = {'current_month_spend_usd': 500}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Monthly budget exceeded', result.message)
        self.assertIn('$500.00', result.message)

    def test_over_budget_soft_limit_warns(self):
        """Test warning when over budget with soft limit."""
        policy = self._create_policy({
            'monthly_budget_usd': 500,
            'hard_limit': False,
        })
        context = {'current_month_spend_usd': 600}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('soft limit', result.warnings[0])

    def test_approaching_budget_warning(self):
        """Test warning when approaching budget threshold."""
        policy = self._create_policy({
            'monthly_budget_usd': 500,
            'alert_threshold_percent': 80,
        })
        context = {'current_month_spend_usd': 450}  # 90% used

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('Approaching budget limit', result.warnings[0])
        self.assertIn('90.0%', result.warnings[0])

    def test_budget_info_added_to_context(self):
        """Test that budget info is added to context."""
        policy = self._create_policy({'monthly_budget_usd': 500})
        context = {'current_month_spend_usd': 200}

        self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertIn('budget_info', context)
        self.assertEqual(context['budget_info']['monthly_budget_usd'], 500)
        self.assertEqual(context['budget_info']['current_spend_usd'], 200)
        self.assertEqual(context['budget_info']['remaining_usd'], 300)
        self.assertEqual(context['budget_info']['percent_used'], 40)


class ToolPermissionEvaluatorTest(TestCase):
    """Tests for ToolPermissionEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = ToolPermissionEvaluator()

    def _create_policy(self, config):
        policy = Policy(
            organization=self.org,
            name='Tool Permission Policy',
            policy_type=Policy.PolicyType.TOOL_PERMISSION,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config=config,
        )
        policy.save()
        return policy

    def test_non_tool_call_passes(self):
        """Test that non-tool_call actions always pass."""
        policy = self._create_policy({'denied_tools': ['shell']})
        context = {'tool_name': 'shell'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_no_tool_name_passes(self):
        """Test that missing tool_name passes."""
        policy = self._create_policy({'denied_tools': ['shell']})
        context = {}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertTrue(result.passed)

    def test_denied_tool_fails(self):
        """Test that denied tools are blocked."""
        policy = self._create_policy({
            'denied_tools': ['shell', 'sudo', 'rm']
        })
        context = {'tool_name': 'shell'}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('shell', result.message)
        self.assertIn('denied', result.message)

    def test_allowed_tool_passes(self):
        """Test that allowed tools pass."""
        policy = self._create_policy({
            'allowed_tools': ['search', 'read_file']
        })
        context = {'tool_name': 'search'}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertTrue(result.passed)

    def test_tool_not_in_allowed_list_fails(self):
        """Test that tools not in allowed list are blocked."""
        policy = self._create_policy({
            'allowed_tools': ['search', 'read_file']
        })
        context = {'tool_name': 'execute_sql'}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('execute_sql', result.message)
        self.assertIn('not in allowed list', result.message)

    def test_denied_takes_precedence_over_allowed(self):
        """Test that denied_tools takes precedence over allowed_tools."""
        policy = self._create_policy({
            'allowed_tools': ['search', 'shell'],
            'denied_tools': ['shell'],
        })
        context = {'tool_name': 'shell'}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('denied', result.message)

    def test_requires_approval_without_token_fails(self):
        """Test that tools requiring approval fail without token."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })
        context = {'tool_name': 'delete_database'}

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('requires approval', result.message)

    def test_requires_approval_with_valid_token_passes(self):
        """Test that tools requiring approval pass with valid token."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        # Create a valid approval token
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id=str(policy.id),
            granted_by='admin',
            user_id='user123',
        )

        context = {
            'tool_name': 'delete_database',
            'approval_token': token,
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertTrue(result.passed)

    def test_approval_token_wrong_tool_fails(self):
        """Test that approval token for wrong tool fails."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        # Create token for different tool
        token = create_tool_approval_token(
            tool_name='send_email',
            policy_id=str(policy.id),
            granted_by='admin',
        )

        context = {
            'tool_name': 'delete_database',
            'approval_token': token,
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('send_email', result.message)

    def test_approval_token_wrong_policy_fails(self):
        """Test that approval token for wrong policy fails."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        # Create token for different policy
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id='wrong-policy-id',
            granted_by='admin',
        )

        context = {
            'tool_name': 'delete_database',
            'approval_token': token,
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('different policy', result.message)

    def test_approval_token_wrong_user_fails(self):
        """Test that approval token for wrong user fails."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        # Create token for different user
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id=str(policy.id),
            granted_by='admin',
            user_id='other_user',
        )

        context = {
            'tool_name': 'delete_database',
            'approval_token': token,
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('different user', result.message)

    def test_approval_token_expired_fails(self):
        """Test that expired approval token fails."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        # Create an expired token by mocking signing.loads to raise SignatureExpired
        with patch('zentinelle.services.evaluators.tool_permission.signing.loads') as mock_loads:
            mock_loads.side_effect = signing.SignatureExpired('Signature expired')

            context = {
                'tool_name': 'delete_database',
                'approval_token': 'expired_token',
            }

            result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

            self.assertFalse(result.passed)
            self.assertIn('expired', result.message)

    def test_approval_token_invalid_signature_fails(self):
        """Test that invalid signature fails."""
        policy = self._create_policy({
            'requires_approval': ['delete_database']
        })

        context = {
            'tool_name': 'delete_database',
            'approval_token': 'invalid_token_here',
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('Invalid approval token', result.message)

    def test_sql_read_only_blocks_write(self):
        """Test SQL read-only mode blocks write operations."""
        policy = self._create_policy({
            'tool_configs': {
                'execute_sql': {
                    'read_only': True,
                }
            }
        })
        context = {
            'tool_name': 'execute_sql',
            'tool_args': {'query': 'DELETE FROM users WHERE id = 1'},
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('DELETE', result.message)
        self.assertIn('read-only', result.message)

    def test_sql_read_only_allows_select(self):
        """Test SQL read-only mode allows SELECT."""
        policy = self._create_policy({
            'tool_configs': {
                'execute_sql': {
                    'read_only': True,
                }
            }
        })
        context = {
            'tool_name': 'execute_sql',
            'tool_args': {'query': 'SELECT * FROM users'},
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertTrue(result.passed)

    def test_file_allowed_paths_pass(self):
        """Test file operation with allowed path passes."""
        policy = self._create_policy({
            'tool_configs': {
                'read_file': {
                    'allowed_paths': ['/home/user/', '/tmp/'],
                }
            }
        })
        context = {
            'tool_name': 'read_file',
            'tool_args': {'path': '/home/user/document.txt'},
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertTrue(result.passed)

    def test_file_allowed_paths_fail(self):
        """Test file operation with disallowed path fails."""
        policy = self._create_policy({
            'tool_configs': {
                'read_file': {
                    'allowed_paths': ['/home/user/'],
                }
            }
        })
        context = {
            'tool_name': 'read_file',
            'tool_args': {'path': '/etc/passwd'},
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('/etc/passwd', result.message)
        self.assertIn('not in allowed paths', result.message)

    def test_file_blocked_paths_fail(self):
        """Test file operation with blocked path fails."""
        policy = self._create_policy({
            'tool_configs': {
                'write_file': {
                    'blocked_paths': ['/etc/', '/root/'],
                }
            }
        })
        context = {
            'tool_name': 'write_file',
            'tool_args': {'path': '/etc/shadow'},
        }

        result = self.evaluator.evaluate(policy, 'tool_call', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('blocked paths', result.message)


class SecretAccessEvaluatorTest(TestCase):
    """Tests for SecretAccessEvaluator."""

    def setUp(self):
        self.org = Organization.objects.create(name="Test Org")
        self.evaluator = SecretAccessEvaluator()

    def _create_policy(self, config):
        return Policy(
            organization=self.org,
            name='Secret Access Policy',
            policy_type=Policy.PolicyType.SECRET_ACCESS,
            scope_type=Policy.ScopeType.ORGANIZATION,
            config=config,
        )

    def test_non_secret_access_passes(self):
        """Test that non-secret_access actions always pass."""
        policy = self._create_policy({
            'allowed_bundles': ['specific-bundle']
        })
        context = {'bundle_slug': 'any-bundle'}

        result = self.evaluator.evaluate(policy, 'spawn', 'user123', context)

        self.assertTrue(result.passed)

    def test_allowed_bundle_passes(self):
        """Test that allowed bundles pass."""
        policy = self._create_policy({
            'allowed_bundles': ['ai-keys', 'database-creds']
        })
        context = {'bundle_slug': 'ai-keys'}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertTrue(result.passed)

    def test_disallowed_bundle_fails(self):
        """Test that disallowed bundles fail."""
        policy = self._create_policy({
            'allowed_bundles': ['ai-keys']
        })
        context = {'bundle_slug': 'database-creds'}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('database-creds', result.message)
        self.assertIn('not allowed', result.message)

    def test_denied_provider_fails(self):
        """Test that denied providers fail."""
        policy = self._create_policy({
            'denied_providers': ['anthropic', 'openai']
        })
        context = {'provider': 'anthropic'}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertFalse(result.passed)
        self.assertIn('anthropic', result.message)
        self.assertIn('denied', result.message)

    def test_non_denied_provider_passes(self):
        """Test that non-denied providers pass."""
        policy = self._create_policy({
            'denied_providers': ['anthropic']
        })
        context = {'provider': 'openai'}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertTrue(result.passed)

    def test_no_bundle_restriction_passes(self):
        """Test that any bundle passes when no restrictions configured."""
        policy = self._create_policy({})
        context = {'bundle_slug': 'any-bundle'}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertTrue(result.passed)

    def test_no_context_passes(self):
        """Test that empty context passes."""
        policy = self._create_policy({
            'allowed_bundles': ['ai-keys']
        })
        context = {}

        result = self.evaluator.evaluate(policy, 'secret_access', 'user123', context)

        self.assertTrue(result.passed)


class CreateToolApprovalTokenTest(TestCase):
    """Tests for create_tool_approval_token helper function."""

    def test_create_token_basic(self):
        """Test creating a basic approval token."""
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id='policy-123',
            granted_by='admin',
        )

        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 0)

    def test_create_token_with_user(self):
        """Test creating a token for a specific user."""
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id='policy-123',
            granted_by='admin',
            user_id='user123',
        )

        # Decode and verify
        payload = signing.loads(token, salt='tool-approval')

        self.assertEqual(payload['tool'], 'delete_database')
        self.assertEqual(payload['policy'], 'policy-123')
        self.assertEqual(payload['granted_by'], 'admin')
        self.assertEqual(payload['user'], 'user123')

    def test_create_token_with_reason(self):
        """Test creating a token with approval reason."""
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id='policy-123',
            granted_by='admin',
            reason='Approved for maintenance window',
        )

        payload = signing.loads(token, salt='tool-approval')

        self.assertEqual(payload['reason'], 'Approved for maintenance window')

    def test_create_token_includes_timestamp(self):
        """Test that token includes granted_at timestamp."""
        token = create_tool_approval_token(
            tool_name='delete_database',
            policy_id='policy-123',
            granted_by='admin',
        )

        payload = signing.loads(token, salt='tool-approval')

        self.assertIn('granted_at', payload)
        # Verify it's a valid ISO timestamp
        self.assertIsNotNone(payload['granted_at'])
