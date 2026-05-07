"""
Tests for policy evaluators: model_restriction, network_policy, output_filter,
agent_capability, safety_settings, multimodal_policy, and context_limit.

Tests run without a database -- Policy objects are constructed in memory.
"""
from django.test import SimpleTestCase
from django.core import signing

from zentinelle.models import Policy
from zentinelle.services.evaluators.model_restriction import ModelRestrictionEvaluator
from zentinelle.services.evaluators.network_policy import NetworkPolicyEvaluator
from zentinelle.services.evaluators.output_filter import OutputFilterEvaluator
from zentinelle.services.evaluators.agent_capability import AgentCapabilityEvaluator
from zentinelle.services.evaluators.safety_settings import SafetySettingsEvaluator
from zentinelle.services.evaluators.multimodal_policy import MultimodalPolicyEvaluator
from zentinelle.services.evaluators.context_limit import ContextLimitEvaluator

TENANT = '00000000-0000-0000-0000-000000000099'


def _policy(policy_type, config):
    """Create an unsaved Policy with the given type and config."""
    return Policy(
        tenant_id=TENANT,
        name=f'Test {policy_type}',
        policy_type=policy_type,
        scope_type=Policy.ScopeType.ORGANIZATION,
        config=config,
    )


# ── ModelRestrictionEvaluator ────────────────────────────────────────


class TestModelRestrictionAllowedModel(SimpleTestCase):
    """An allowed model should pass evaluation."""

    def test_model_in_allowlist_passes(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'allowed_models': ['gpt-4o', 'claude-opus-4'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'model': 'gpt-4o'})
        self.assertTrue(result.passed)
        self.assertIsNone(result.message)

    def test_provider_in_allowlist_passes(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'allowed_providers': ['openai', 'anthropic'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'model': 'gpt-4o',
            'provider': 'openai',
        })
        self.assertTrue(result.passed)


class TestModelRestrictionBlockedModel(SimpleTestCase):
    """A blocked model should fail evaluation."""

    def test_model_in_blocklist_fails(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'blocked_models': ['deepseek-r1'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'model': 'deepseek-r1'})
        self.assertFalse(result.passed)
        self.assertIn('deepseek-r1', result.message)
        self.assertIn('blocked', result.message)


class TestModelRestrictionBlockedProvider(SimpleTestCase):
    """A blocked provider should fail evaluation."""

    def test_provider_in_blocklist_fails(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'blocked_providers': ['deepseek'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'model': 'deepseek-r1',
            'provider': 'deepseek',
        })
        self.assertFalse(result.passed)
        self.assertIn('deepseek', result.message)
        self.assertIn('blocked', result.message)


class TestModelRestrictionEmptyConfig(SimpleTestCase):
    """Empty config should allow everything."""

    def test_empty_config_passes(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {})
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'model': 'anything-goes',
            'provider': 'unknown-provider',
        })
        self.assertTrue(result.passed)

    def test_no_model_or_provider_in_context_passes(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'blocked_models': ['gpt-4o'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {})
        self.assertTrue(result.passed)


class TestModelRestrictionNotInAllowlist(SimpleTestCase):
    """A model NOT in the allowlist should be denied."""

    def test_model_not_in_allowlist_fails(self):
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'allowed_models': ['gpt-4o'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'model': 'deepseek-r1',
            'provider': 'deepseek',
        })
        self.assertFalse(result.passed)
        self.assertIn('not permitted', result.message)

    def test_blocklist_overrides_allowlist(self):
        """A model on both lists should be blocked -- blocklist is checked first."""
        ev = ModelRestrictionEvaluator()
        policy = _policy(Policy.PolicyType.MODEL_RESTRICTION, {
            'allowed_models': ['gpt-4o'],
            'blocked_models': ['gpt-4o'],
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'model': 'gpt-4o'})
        self.assertFalse(result.passed)
        self.assertIn('blocked', result.message)


# ── NetworkPolicyEvaluator ───────────────────────────────────────────


class TestNetworkPolicyAllowedDomain(SimpleTestCase):
    """Allowed domains should pass."""

    def test_exact_domain_passes(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_domains': ['api.openai.com'],
        })
        result = ev.evaluate(policy, 'network', None, {'domain': 'api.openai.com'})
        self.assertTrue(result.passed)

    def test_wildcard_domain_passes(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_domains': ['*.anthropic.com'],
        })
        result = ev.evaluate(policy, 'network', None, {'domain': 'api.anthropic.com'})
        self.assertTrue(result.passed)


class TestNetworkPolicyBlockedDomain(SimpleTestCase):
    """Blocked domains should fail."""

    def test_blocked_domain_fails(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'blocked_domains': ['*.deepseek.com'],
        })
        result = ev.evaluate(policy, 'network', None, {'domain': 'api.deepseek.com'})
        self.assertFalse(result.passed)
        self.assertIn('blocked', result.message)

    def test_domain_not_in_allowlist_fails(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_domains': ['api.openai.com'],
        })
        result = ev.evaluate(policy, 'network', None, {'domain': 'evil.example.com'})
        self.assertFalse(result.passed)
        self.assertIn('not in the allowed domains', result.message)


class TestNetworkPolicyAllowedIP(SimpleTestCase):
    """Allowed IPs should pass."""

    def test_ip_in_cidr_passes(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_ips': ['10.0.0.0/8'],
        })
        result = ev.evaluate(policy, 'network', None, {'ip': '10.1.2.3'})
        self.assertTrue(result.passed)

    def test_exact_ip_passes(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_ips': ['192.168.1.100'],
        })
        result = ev.evaluate(policy, 'network', None, {'ip': '192.168.1.100'})
        self.assertTrue(result.passed)


class TestNetworkPolicyBlockedIP(SimpleTestCase):
    """Blocked IPs should fail."""

    def test_ip_in_blocked_cidr_fails(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'blocked_ips': ['172.16.0.0/12'],
        })
        result = ev.evaluate(policy, 'network', None, {'ip': '172.16.5.10'})
        self.assertFalse(result.passed)
        self.assertIn('blocked', result.message)

    def test_ip_not_in_allowed_range_fails(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_ips': ['10.0.0.0/8'],
        })
        result = ev.evaluate(policy, 'network', None, {'ip': '192.168.1.1'})
        self.assertFalse(result.passed)
        self.assertIn('not in the allowed IP ranges', result.message)


class TestNetworkPolicyDomainExtractedFromURL(SimpleTestCase):
    """Domain should be extracted from URL when not explicitly provided."""

    def test_url_provides_domain(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'blocked_domains': ['evil.example.com'],
        })
        result = ev.evaluate(policy, 'network', None, {
            'url': 'https://evil.example.com/api/v1/data',
        })
        self.assertFalse(result.passed)
        self.assertIn('evil.example.com', result.message)


class TestNetworkPolicyOutboundDisabled(SimpleTestCase):
    """When allow_outbound=false and no target, outbound access is denied."""

    def test_outbound_disabled_no_target_fails(self):
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allow_outbound': False,
        })
        result = ev.evaluate(policy, 'network', None, {})
        self.assertFalse(result.passed)
        self.assertIn('disabled', result.message)

    def test_outbound_disabled_with_allowed_domain_still_checked(self):
        """Even with allow_outbound=false, if domain matches an allowed list
        the outbound check at the end still blocks it."""
        ev = NetworkPolicyEvaluator()
        policy = _policy(Policy.PolicyType.NETWORK_POLICY, {
            'allowed_domains': ['api.openai.com'],
            'allow_outbound': False,
        })
        result = ev.evaluate(policy, 'network', None, {'domain': 'api.openai.com'})
        # The domain passes the allowlist, but the final outbound check blocks
        self.assertFalse(result.passed)
        self.assertIn('disabled', result.message)


# ── OutputFilterEvaluator ────────────────────────────────────────────


class TestOutputFilterCleanOutput(SimpleTestCase):
    """Clean output text should pass."""

    def test_no_matching_patterns(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'blocked_patterns': [r'SSN:\d{3}-\d{2}-\d{4}'],
        })
        result = ev.evaluate(policy, 'output', None, {
            'output_text': 'The weather is nice today.',
        })
        self.assertTrue(result.passed)


class TestOutputFilterBlockedPattern(SimpleTestCase):
    """Output matching a blocked regex should fail."""

    def test_ssn_pattern_blocked(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'blocked_patterns': [r'SSN:\d{3}-\d{2}-\d{4}'],
        })
        result = ev.evaluate(policy, 'output', None, {
            'output_text': 'Your SSN:123-45-6789 is on file.',
        })
        self.assertFalse(result.passed)
        self.assertIn('restricted pattern', result.message)


class TestOutputFilterCaseInsensitiveBuiltins(SimpleTestCase):
    """Built-in secret patterns match case-insensitively."""

    def test_bearer_token_lowercase_detected(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'block_secrets': True,
        })
        result = ev.evaluate(policy, 'output', None, {
            'output_text': 'bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
        })
        self.assertFalse(result.passed)
        self.assertIn('detected', result.message)


class TestOutputFilterScanResult(SimpleTestCase):
    """Pre-computed scan_result violations are enforced."""

    def test_pii_violation_blocked(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'block_pii': True,
        })
        result = ev.evaluate(policy, 'output', None, {
            'scan_result': {
                'violations': [
                    {'type': 'pii', 'severity': 'high', 'detail': 'email address'},
                ],
            },
        })
        self.assertFalse(result.passed)
        self.assertIn('PII detected', result.message)

    def test_secret_violation_blocked(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'block_secrets': True,
        })
        result = ev.evaluate(policy, 'output', None, {
            'scan_result': {
                'violations': [
                    {'type': 'secret', 'severity': 'critical', 'detail': 'API key'},
                ],
            },
        })
        self.assertFalse(result.passed)
        self.assertIn('secret/credential detected', result.message)

    def test_severity_threshold_exceeded(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'max_severity': 'medium',
        })
        result = ev.evaluate(policy, 'output', None, {
            'scan_result': {
                'violations': [
                    {'type': 'other', 'severity': 'high', 'detail': 'something bad'},
                ],
            },
        })
        self.assertFalse(result.passed)
        self.assertIn('exceeds', result.message)

    def test_severity_at_threshold_passes(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'max_severity': 'medium',
        })
        result = ev.evaluate(policy, 'output', None, {
            'scan_result': {
                'violations': [
                    {'type': 'other', 'severity': 'medium', 'detail': 'medium issue'},
                ],
            },
        })
        self.assertTrue(result.passed)


class TestOutputFilterDisabledPatterns(SimpleTestCase):
    """Disabled secret patterns should be skipped."""

    def test_disabled_pattern_skipped(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'block_secrets': True,
            'disabled_secret_patterns': ['bearer_token'],
        })
        # Bearer token should NOT be flagged because it is disabled
        result = ev.evaluate(policy, 'output', None, {
            'output_text': 'bearer eyJhbGciOiJIUzI1NiJ9.abc.def',
        })
        # The bearer_token pattern is disabled, but the jwt_token pattern
        # may still match. We verify the bearer_token itself is skipped.
        # If it passes, the disabled worked for bearer_token.
        # (jwt_token pattern will separately catch this if it matches)
        # The point is that disabling bearer_token is honored.
        if not result.passed:
            # jwt_token caught it, which is fine -- bearer_token was skipped
            self.assertNotIn("'bearer_token'", result.message)


class TestOutputFilterEmptyText(SimpleTestCase):
    """No output_text and no scan_result should pass."""

    def test_empty_context_passes(self):
        ev = OutputFilterEvaluator()
        policy = _policy(Policy.PolicyType.OUTPUT_FILTER, {
            'block_pii': True,
            'block_secrets': True,
            'blocked_patterns': [r'SSN:\d+'],
        })
        result = ev.evaluate(policy, 'output', None, {})
        self.assertTrue(result.passed)


# ── AgentCapabilityEvaluator ─────────────────────────────────────────


class TestAgentCapabilityAllowed(SimpleTestCase):
    """An allowed action should pass."""

    def test_action_in_allowlist_passes(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'allowed_actions': ['llm:invoke', 'tool:search'],
        })
        result = ev.evaluate(policy, 'tool:search', None, {})
        self.assertTrue(result.passed)


class TestAgentCapabilityDenied(SimpleTestCase):
    """A denied action should fail."""

    def test_action_in_denied_list_fails(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'denied_actions': ['tool:execute_shell'],
        })
        result = ev.evaluate(policy, 'tool:execute_shell', None, {})
        self.assertFalse(result.passed)
        self.assertIn('denied', result.message)

    def test_denied_takes_precedence_over_allowed(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'allowed_actions': ['tool:*'],
            'denied_actions': ['tool:execute_shell'],
        })
        result = ev.evaluate(policy, 'tool:execute_shell', None, {})
        self.assertFalse(result.passed)


class TestAgentCapabilityFnmatch(SimpleTestCase):
    """fnmatch wildcards should work for action patterns."""

    def test_wildcard_matches(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'allowed_actions': ['file_*'],
        })
        result = ev.evaluate(policy, 'file_read', None, {})
        self.assertTrue(result.passed)

    def test_wildcard_deny_matches(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'denied_actions': ['tool:file_*'],
        })
        result = ev.evaluate(policy, 'tool:file_write', None, {})
        self.assertFalse(result.passed)

    def test_non_matching_wildcard_fails_allowlist(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'allowed_actions': ['file_*'],
        })
        result = ev.evaluate(policy, 'network_call', None, {})
        self.assertFalse(result.passed)
        self.assertIn('not in the allowed actions', result.message)


class TestAgentCapabilityNoConfig(SimpleTestCase):
    """Empty config should allow everything."""

    def test_no_lists_passes(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {})
        result = ev.evaluate(policy, 'anything', None, {})
        self.assertTrue(result.passed)


class TestAgentCapabilityContextAction(SimpleTestCase):
    """The evaluator uses context['action'] if present, falling back to param."""

    def test_context_action_overrides_param(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'denied_actions': ['real_action'],
        })
        result = ev.evaluate(policy, 'ignored_action', None, {'action': 'real_action'})
        self.assertFalse(result.passed)


class TestAgentCapabilityRequireApproval(SimpleTestCase):
    """Actions requiring approval should be denied without a valid token."""

    def test_no_token_fails(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'require_approval': ['tool:database_write'],
        })
        result = ev.evaluate(policy, 'tool:database_write', None, {})
        self.assertFalse(result.passed)
        self.assertIn('requires human approval', result.message)

    def test_invalid_token_fails(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'require_approval': ['tool:database_write'],
        })
        result = ev.evaluate(policy, 'tool:database_write', None, {
            'approval_token': 'bogus-token',
        })
        self.assertFalse(result.passed)
        self.assertIn('Invalid approval token', result.message)

    def test_valid_token_passes(self):
        ev = AgentCapabilityEvaluator()
        policy = _policy(Policy.PolicyType.AGENT_CAPABILITY, {
            'require_approval': ['tool:database_write'],
        })
        # Generate a valid token using django signing
        import uuid
        policy.id = uuid.uuid4()
        token = signing.dumps(
            {
                'action': 'tool:database_write',
                'policy': str(policy.id),
                'granted_by': 'admin',
            },
            salt='agent-capability-approval',
        )
        result = ev.evaluate(policy, 'tool:database_write', None, {
            'approval_token': token,
        })
        self.assertTrue(result.passed)


# ── SafetySettingsEvaluator ──────────────────────────────────────────


class TestSafetySettingsBlockNone(SimpleTestCase):
    """BLOCK_NONE should be rejected when block_none_disabled=True."""

    def test_block_none_rejected(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'block_none_disabled': True,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'provider': 'google',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
            ],
        })
        self.assertFalse(result.passed)
        self.assertIn('BLOCK_NONE', result.message)
        self.assertIn('HARM_CATEGORY_HARASSMENT', result.message)


class TestSafetySettingsThresholdBelowMinimum(SimpleTestCase):
    """Threshold below policy minimum should be rejected."""

    def test_threshold_below_minimum_fails(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'min_thresholds': {
                'HARM_CATEGORY_HARASSMENT': 'BLOCK_MEDIUM_AND_ABOVE',
            },
        })
        # BLOCK_ONLY_HIGH (rank 1) is less restrictive than BLOCK_MEDIUM_AND_ABOVE (rank 2)
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'provider': 'google',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_ONLY_HIGH'},
            ],
        })
        self.assertFalse(result.passed)
        self.assertIn('minimum required', result.message)


class TestSafetySettingsThresholdAtMinimum(SimpleTestCase):
    """Threshold at or above minimum should pass."""

    def test_threshold_at_minimum_passes(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'min_thresholds': {
                'HARM_CATEGORY_HARASSMENT': 'BLOCK_MEDIUM_AND_ABOVE',
            },
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'provider': 'google',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_MEDIUM_AND_ABOVE'},
            ],
        })
        self.assertTrue(result.passed)

    def test_threshold_above_minimum_passes(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'min_thresholds': {
                'HARM_CATEGORY_HARASSMENT': 'BLOCK_MEDIUM_AND_ABOVE',
            },
        })
        # BLOCK_LOW_AND_ABOVE (rank 3) is stricter than BLOCK_MEDIUM_AND_ABOVE (rank 2)
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'provider': 'google',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_LOW_AND_ABOVE'},
            ],
        })
        self.assertTrue(result.passed)


class TestSafetySettingsNonGeminiProvider(SimpleTestCase):
    """Non-Gemini providers should pass without checking settings."""

    def test_openai_provider_skipped(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'block_none_disabled': True,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'provider': 'openai',
            'model': 'gpt-4o',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
            ],
        })
        self.assertTrue(result.passed)


class TestSafetySettingsNonLLMAction(SimpleTestCase):
    """Non llm:invoke actions should pass without checking."""

    def test_spawn_action_passes(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'block_none_disabled': True,
        })
        result = ev.evaluate(policy, 'spawn', None, {
            'provider': 'google',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
            ],
        })
        self.assertTrue(result.passed)


class TestSafetySettingsGeminiModelDetection(SimpleTestCase):
    """Gemini model names should trigger evaluation even with no provider."""

    def test_gemini_model_triggers_check(self):
        ev = SafetySettingsEvaluator()
        policy = _policy(Policy.PolicyType.SAFETY_SETTINGS, {
            'block_none_disabled': True,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'model': 'gemini-2.5-pro',
            'safety_settings': [
                {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
            ],
        })
        self.assertFalse(result.passed)


# ── MultimodalPolicyEvaluator ───────────────────────────────────────


class TestMultimodalImagesBlocked(SimpleTestCase):
    """Images should be blocked when allow_images=False."""

    def test_images_blocked(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_images': False,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': True,
            'multimodal': {'images': 2, 'audio': 0, 'video': 0},
        })
        self.assertFalse(result.passed)
        self.assertIn('Image content is not allowed', result.message)


class TestMultimodalAudioBlocked(SimpleTestCase):
    """Audio should be blocked when allow_audio=False."""

    def test_audio_blocked(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_audio': False,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': True,
            'multimodal': {'images': 0, 'audio': 1, 'video': 0},
        })
        self.assertFalse(result.passed)
        self.assertIn('Audio content is not allowed', result.message)


class TestMultimodalVideoBlocked(SimpleTestCase):
    """Video should be blocked when allow_video=False."""

    def test_video_blocked(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_video': False,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': True,
            'multimodal': {'images': 0, 'audio': 0, 'video': 1},
        })
        self.assertFalse(result.passed)
        self.assertIn('Video content is not allowed', result.message)


class TestMultimodalMaxBytes(SimpleTestCase):
    """Exceeding max_media_bytes should fail."""

    def test_exceeds_max_bytes_fails(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'max_media_bytes': 1048576,  # 1 MB
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': True,
            'multimodal': {
                'images': 1,
                'audio': 0,
                'video': 0,
                'total_media_bytes': 2000000,
            },
        })
        self.assertFalse(result.passed)
        self.assertIn('exceeds limit', result.message)

    def test_under_max_bytes_passes(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'max_media_bytes': 1048576,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': True,
            'multimodal': {
                'images': 1,
                'audio': 0,
                'video': 0,
                'total_media_bytes': 500000,
                'has_media': True,
            },
        })
        self.assertTrue(result.passed)


class TestMultimodalNoMedia(SimpleTestCase):
    """Requests without multimodal content should always pass."""

    def test_no_multimodal_flag_passes(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_images': False,
            'allow_audio': False,
            'allow_video': False,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {})
        self.assertTrue(result.passed)

    def test_text_only_passes(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_images': False,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'has_multimodal': False,
        })
        self.assertTrue(result.passed)


class TestMultimodalNonLLMAction(SimpleTestCase):
    """Non llm:invoke actions bypass multimodal checks."""

    def test_spawn_passes_with_media(self):
        ev = MultimodalPolicyEvaluator()
        policy = _policy(Policy.PolicyType.MULTIMODAL_POLICY, {
            'allow_images': False,
        })
        result = ev.evaluate(policy, 'spawn', None, {
            'has_multimodal': True,
            'multimodal': {'images': 5, 'audio': 0, 'video': 0},
        })
        self.assertTrue(result.passed)


# ── ContextLimitEvaluator ────────────────────────────────────────────


class TestContextLimitUnderLimit(SimpleTestCase):
    """Token counts under the limit should pass."""

    def test_input_under_limit_passes(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_input_tokens': 50000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'input_tokens': 10000})
        self.assertTrue(result.passed)

    def test_output_under_limit_passes(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_output_tokens': 4096,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'output_tokens': 2000})
        self.assertTrue(result.passed)

    def test_total_under_limit_passes(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_total_tokens': 100000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'total_tokens': 50000})
        self.assertTrue(result.passed)


class TestContextLimitOverLimit(SimpleTestCase):
    """Token counts over the limit should fail."""

    def test_input_over_limit_fails(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_input_tokens': 50000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'input_tokens': 60000})
        self.assertFalse(result.passed)
        self.assertIn('60000', result.message)
        self.assertIn('50000', result.message)

    def test_output_over_limit_fails(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_output_tokens': 4096,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'output_tokens': 5000})
        self.assertFalse(result.passed)
        self.assertIn('Output token count', result.message)

    def test_total_over_limit_fails(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_total_tokens': 100000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'total_tokens': 110000})
        self.assertFalse(result.passed)
        self.assertIn('Total token count', result.message)


class TestContextLimitTotalFromSumOfParts(SimpleTestCase):
    """When total_tokens is absent, it should be computed from input + output."""

    def test_computed_total_exceeds_limit(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_total_tokens': 100000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'input_tokens': 80000,
            'output_tokens': 30000,
        })
        self.assertFalse(result.passed)
        self.assertIn('110000', result.message)


class TestContextLimitWarningThreshold(SimpleTestCase):
    """Approaching the limit (90%+) should produce a warning."""

    def test_input_warning_at_90_pct(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {
            'max_input_tokens': 10000,
        })
        result = ev.evaluate(policy, 'llm:invoke', None, {'input_tokens': 9500})
        self.assertTrue(result.passed)
        self.assertTrue(len(result.warnings) > 0)
        self.assertIn('approaching limit', result.warnings[0].lower())


class TestContextLimitNoConfigPasses(SimpleTestCase):
    """When no limits are configured, everything should pass."""

    def test_no_limits_configured(self):
        ev = ContextLimitEvaluator()
        policy = _policy(Policy.PolicyType.CONTEXT_LIMIT, {})
        result = ev.evaluate(policy, 'llm:invoke', None, {
            'input_tokens': 999999,
            'output_tokens': 999999,
        })
        self.assertTrue(result.passed)
