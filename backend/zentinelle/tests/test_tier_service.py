"""
Tests for zentinelle.services.tier_service

Tests cover:
- Tier validation and constants
- Tier priority and comparison
- Feature availability checks
- Tier limits
- Organization tier info

These tests do not require database access and can run without Django setup.
"""
import pytest
from unittest.mock import Mock

from zentinelle.services.tier_service import (
    ZentinelleTierService,
    ZentinelleTiers,
    ZentinelleFeatures,
    TierLimits,
    zentinelle_tier_service,
    TIER_FEATURES,
    TIER_LIMITS,
    FEATURE_REQUIRED_TIER,
)


# =============================================================================
# Tests for ZentinelleTiers class
# =============================================================================

class TestZentinelleTiers:
    """Tests for the ZentinelleTiers class."""

    def test_tier_constants_exist(self):
        """Test that all tier constants are defined."""
        assert ZentinelleTiers.NONE == 'none'
        assert ZentinelleTiers.BASIC == 'basic'
        assert ZentinelleTiers.PRO == 'pro'
        assert ZentinelleTiers.ENTERPRISE == 'enterprise'

    def test_all_tiers_in_priority_order(self):
        """Test that ALL_TIERS is in correct priority order."""
        expected = ['none', 'basic', 'pro', 'enterprise']
        assert ZentinelleTiers.ALL_TIERS == expected

    def test_is_valid_with_valid_tiers(self):
        """Test is_valid returns True for all valid tiers."""
        for tier in ZentinelleTiers.ALL_TIERS:
            assert ZentinelleTiers.is_valid(tier), f"Expected {tier} to be valid"

    def test_is_valid_with_invalid_tier(self):
        """Test is_valid returns False for invalid tiers."""
        assert not ZentinelleTiers.is_valid('invalid')
        assert not ZentinelleTiers.is_valid('')
        assert not ZentinelleTiers.is_valid('premium')

    def test_get_priority_values(self):
        """Test that priority values are in correct order."""
        assert ZentinelleTiers.get_priority('none') == 0
        assert ZentinelleTiers.get_priority('basic') == 1
        assert ZentinelleTiers.get_priority('pro') == 2
        assert ZentinelleTiers.get_priority('enterprise') == 3

    def test_get_priority_invalid_tier_raises(self):
        """Test that get_priority raises ValueError for invalid tier."""
        with pytest.raises(ValueError) as exc_info:
            ZentinelleTiers.get_priority('invalid')
        assert 'Invalid tier' in str(exc_info.value)

    def test_compare_equal_tiers(self):
        """Test compare returns 0 for equal tiers."""
        for tier in ZentinelleTiers.ALL_TIERS:
            assert ZentinelleTiers.compare(tier, tier) == 0, \
                f"Expected compare({tier}, {tier}) to return 0"

    def test_compare_lower_tier(self):
        """Test compare returns -1 when first tier is lower."""
        assert ZentinelleTiers.compare('none', 'basic') == -1
        assert ZentinelleTiers.compare('basic', 'pro') == -1
        assert ZentinelleTiers.compare('pro', 'enterprise') == -1
        assert ZentinelleTiers.compare('none', 'enterprise') == -1

    def test_compare_higher_tier(self):
        """Test compare returns 1 when first tier is higher."""
        assert ZentinelleTiers.compare('basic', 'none') == 1
        assert ZentinelleTiers.compare('pro', 'basic') == 1
        assert ZentinelleTiers.compare('enterprise', 'pro') == 1
        assert ZentinelleTiers.compare('enterprise', 'none') == 1

    def test_is_tier_at_least_same_tier(self):
        """Test is_tier_at_least returns True for same tier."""
        for tier in ZentinelleTiers.ALL_TIERS:
            assert ZentinelleTiers.is_tier_at_least(tier, tier), \
                f"Expected {tier} to be at least {tier}"

    def test_is_tier_at_least_higher_tier(self):
        """Test is_tier_at_least returns True when current tier is higher."""
        assert ZentinelleTiers.is_tier_at_least('enterprise', 'basic')
        assert ZentinelleTiers.is_tier_at_least('pro', 'basic')
        assert ZentinelleTiers.is_tier_at_least('basic', 'none')

    def test_is_tier_at_least_lower_tier(self):
        """Test is_tier_at_least returns False when current tier is lower."""
        assert not ZentinelleTiers.is_tier_at_least('none', 'basic')
        assert not ZentinelleTiers.is_tier_at_least('basic', 'pro')
        assert not ZentinelleTiers.is_tier_at_least('pro', 'enterprise')


# =============================================================================
# Tests for ZentinelleTierService class
# =============================================================================

class TestZentinelleTierService:
    """Tests for the ZentinelleTierService class."""

    @pytest.fixture
    def service(self):
        return zentinelle_tier_service

    def test_singleton_exists(self, service):
        """Test that the singleton instance exists."""
        assert zentinelle_tier_service is not None
        assert isinstance(zentinelle_tier_service, ZentinelleTierService)

    def test_is_valid_tier(self, service):
        """Test is_valid_tier method."""
        assert service.is_valid_tier('none')
        assert service.is_valid_tier('basic')
        assert service.is_valid_tier('pro')
        assert service.is_valid_tier('enterprise')
        assert not service.is_valid_tier('invalid')

    def test_get_all_tiers(self, service):
        """Test get_all_tiers returns all tiers in order."""
        tiers = service.get_all_tiers()
        assert tiers == ['none', 'basic', 'pro', 'enterprise']

    def test_get_tier_priority(self, service):
        """Test get_tier_priority method."""
        assert service.get_tier_priority('none') == 0
        assert service.get_tier_priority('enterprise') == 3

    def test_get_tier_features_none(self, service):
        """Test that none tier has no features."""
        features = service.get_tier_features('none')
        assert features == []

    def test_get_tier_features_basic(self, service):
        """Test basic tier features."""
        features = service.get_tier_features('basic')
        assert 'policy_management' in features
        assert 'basic_monitoring' in features
        assert 'event_logging' in features
        assert 'content_scanning' in features
        # Should not have pro features
        assert 'advanced_policies' not in features

    def test_get_tier_features_pro(self, service):
        """Test pro tier includes basic and pro features."""
        features = service.get_tier_features('pro')
        # Basic features
        assert 'policy_management' in features
        assert 'event_logging' in features
        # Pro features
        assert 'advanced_policies' in features
        assert 'compliance_reports' in features
        assert 'ai_model_registry' in features
        # Should not have enterprise features
        assert 'audit_logs' not in features
        assert 'sso_integration' not in features

    def test_get_tier_features_enterprise(self, service):
        """Test enterprise tier includes all features."""
        features = service.get_tier_features('enterprise')
        # Basic features
        assert 'policy_management' in features
        # Pro features
        assert 'advanced_policies' in features
        # Enterprise features
        assert 'audit_logs' in features
        assert 'sso_integration' in features
        assert 'custom_integrations' in features
        assert 'retention_policies' in features

    def test_get_tier_features_invalid(self, service):
        """Test get_tier_features returns empty list for invalid tier."""
        features = service.get_tier_features('invalid')
        assert features == []

    def test_get_tier_features_set(self, service):
        """Test get_tier_features_set returns a set."""
        features = service.get_tier_features_set('pro')
        assert isinstance(features, set)
        assert 'advanced_policies' in features

    def test_get_tier_limits_none(self, service):
        """Test none tier has zero limits."""
        limits = service.get_tier_limits('none')
        assert isinstance(limits, TierLimits)
        assert limits.max_agents == 0
        assert limits.max_policies == 0

    def test_get_tier_limits_basic(self, service):
        """Test basic tier limits."""
        limits = service.get_tier_limits('basic')
        assert limits.max_agents == 10
        assert limits.max_policies == 5
        assert limits.event_retention_days == 30

    def test_get_tier_limits_pro(self, service):
        """Test pro tier has higher limits than basic."""
        basic_limits = service.get_tier_limits('basic')
        pro_limits = service.get_tier_limits('pro')
        assert pro_limits.max_agents > basic_limits.max_agents
        assert pro_limits.max_policies > basic_limits.max_policies

    def test_get_tier_limits_enterprise(self, service):
        """Test enterprise tier has unlimited (0) for most limits."""
        limits = service.get_tier_limits('enterprise')
        assert limits.max_agents == 0  # 0 = unlimited
        assert limits.max_policies == 0
        assert limits.event_retention_days == 365

    def test_get_tier_display_info(self, service):
        """Test get_tier_display_info returns correct info."""
        info = service.get_tier_display_info('pro')
        assert info['name'] == 'Professional'
        assert 'description' in info
        assert info['color'] == 'purple'

    def test_get_feature_required_tier(self, service):
        """Test get_feature_required_tier returns correct tier."""
        # Basic features
        assert service.get_feature_required_tier('policy_management') == 'basic'
        # Pro features
        assert service.get_feature_required_tier('advanced_policies') == 'pro'
        # Enterprise features
        assert service.get_feature_required_tier('audit_logs') == 'enterprise'

    def test_get_feature_required_tier_unknown(self, service):
        """Test get_feature_required_tier returns None for unknown feature."""
        assert service.get_feature_required_tier('unknown_feature') is None

    def test_is_feature_in_tier(self, service):
        """Test is_feature_in_tier method."""
        # Basic feature in basic tier
        assert service.is_feature_in_tier('policy_management', 'basic')
        # Basic feature in higher tier
        assert service.is_feature_in_tier('policy_management', 'enterprise')
        # Pro feature not in basic tier
        assert not service.is_feature_in_tier('advanced_policies', 'basic')
        # Pro feature in pro tier
        assert service.is_feature_in_tier('advanced_policies', 'pro')

    def test_check_feature_available_success(self, service):
        """Test check_feature_available when feature is available."""
        org = Mock()
        org.zentinelle_tier = 'pro'

        available, message = service.check_feature_available(org, 'advanced_policies')
        assert available
        assert 'Professional' in message

    def test_check_feature_available_tier_too_low(self, service):
        """Test check_feature_available when tier is too low."""
        org = Mock()
        org.zentinelle_tier = 'basic'

        available, message = service.check_feature_available(org, 'advanced_policies')
        assert not available
        assert 'requires' in message.lower()
        assert 'Professional' in message

    def test_check_feature_available_none_tier(self, service):
        """Test check_feature_available when Zentinelle is not enabled."""
        org = Mock()
        org.zentinelle_tier = 'none'

        available, message = service.check_feature_available(org, 'policy_management')
        assert not available
        assert 'not enabled' in message.lower()

    def test_check_feature_available_unknown_feature(self, service):
        """Test check_feature_available with unknown feature."""
        org = Mock()
        org.zentinelle_tier = 'enterprise'

        available, message = service.check_feature_available(org, 'unknown_feature')
        assert not available
        assert 'Unknown' in message

    def test_check_limit_within_limit(self, service):
        """Test check_limit when within limit."""
        org = Mock()
        org.zentinelle_tier = 'basic'

        within, message = service.check_limit(org, 'max_agents', 5)
        assert within
        assert 'remaining' in message

    def test_check_limit_at_limit(self, service):
        """Test check_limit when at limit."""
        org = Mock()
        org.zentinelle_tier = 'basic'

        within, message = service.check_limit(org, 'max_agents', 10)
        assert not within
        assert 'Limit reached' in message

    def test_check_limit_unlimited(self, service):
        """Test check_limit for enterprise tier (unlimited)."""
        org = Mock()
        org.zentinelle_tier = 'enterprise'

        within, message = service.check_limit(org, 'max_agents', 1000)
        assert within
        assert message == 'Unlimited'

    def test_get_org_tier_info(self, service):
        """Test get_org_tier_info returns comprehensive info."""
        org = Mock()
        org.zentinelle_tier = 'pro'

        info = service.get_org_tier_info(org)
        assert info['tier'] == 'pro'
        assert info['priority'] == 2
        assert 'display' in info
        assert 'features' in info
        assert 'limits' in info
        assert info['is_enabled']

    def test_get_org_tier_info_not_enabled(self, service):
        """Test get_org_tier_info when Zentinelle not enabled."""
        org = Mock()
        org.zentinelle_tier = 'none'

        info = service.get_org_tier_info(org)
        assert not info['is_enabled']

    def test_compare_tiers(self, service):
        """Test compare_tiers method."""
        assert service.compare_tiers('basic', 'basic') == 0
        assert service.compare_tiers('basic', 'pro') == -1
        assert service.compare_tiers('enterprise', 'basic') == 1

    def test_is_tier_at_least(self, service):
        """Test is_tier_at_least method."""
        assert service.is_tier_at_least('pro', 'basic')
        assert service.is_tier_at_least('pro', 'pro')
        assert not service.is_tier_at_least('basic', 'pro')

    def test_get_upgrade_path(self, service):
        """Test get_upgrade_path method."""
        assert service.get_upgrade_path('none') == 'basic'
        assert service.get_upgrade_path('basic') == 'pro'
        assert service.get_upgrade_path('pro') == 'enterprise'
        assert service.get_upgrade_path('enterprise') is None

    def test_get_features_in_upgrade(self, service):
        """Test get_features_in_upgrade method."""
        # Basic -> Pro should show pro-only features
        new_features = service.get_features_in_upgrade('basic')
        assert 'advanced_policies' in new_features
        assert 'policy_management' not in new_features  # Already have this

        # Pro -> Enterprise should show enterprise-only features
        new_features = service.get_features_in_upgrade('pro')
        assert 'audit_logs' in new_features
        assert 'advanced_policies' not in new_features  # Already have this

        # Enterprise has no upgrade path
        new_features = service.get_features_in_upgrade('enterprise')
        assert new_features == []


# =============================================================================
# Tests for TIER_FEATURES and FEATURE_REQUIRED_TIER mappings
# =============================================================================

class TestTierFeatureMapping:
    """Tests for TIER_FEATURES and FEATURE_REQUIRED_TIER mappings."""

    def test_tier_features_has_all_tiers(self):
        """Test that TIER_FEATURES has entries for all tiers."""
        for tier in ZentinelleTiers.ALL_TIERS:
            assert tier in TIER_FEATURES, f"Missing {tier} in TIER_FEATURES"

    def test_higher_tiers_include_lower_tier_features(self):
        """Test that higher tiers include all lower tier features."""
        basic_features = set(TIER_FEATURES['basic'])
        pro_features = set(TIER_FEATURES['pro'])
        enterprise_features = set(TIER_FEATURES['enterprise'])

        # Pro should include all basic features
        assert basic_features.issubset(pro_features), \
            "Pro tier should include all basic features"

        # Enterprise should include all pro features
        assert pro_features.issubset(enterprise_features), \
            "Enterprise tier should include all pro features"

    def test_feature_required_tier_maps_all_tier_features(self):
        """Test that all features in TIER_FEATURES are in FEATURE_REQUIRED_TIER."""
        all_features = set()
        for tier, features in TIER_FEATURES.items():
            if tier != 'none':
                all_features.update(features)

        for feature in all_features:
            assert feature in FEATURE_REQUIRED_TIER, \
                f"Feature {feature} not in FEATURE_REQUIRED_TIER"


# =============================================================================
# Tests for TIER_LIMITS configuration
# =============================================================================

class TestTierLimits:
    """Tests for TIER_LIMITS configuration."""

    def test_tier_limits_has_all_tiers(self):
        """Test that TIER_LIMITS has entries for all tiers."""
        for tier in ZentinelleTiers.ALL_TIERS:
            assert tier in TIER_LIMITS, f"Missing {tier} in TIER_LIMITS"

    def test_tier_limits_are_tier_limits_instances(self):
        """Test that all TIER_LIMITS values are TierLimits instances."""
        for tier, limits in TIER_LIMITS.items():
            assert isinstance(limits, TierLimits), \
                f"TIER_LIMITS[{tier}] is not a TierLimits instance"

    def test_limits_increase_with_tier(self):
        """Test that numeric limits generally increase with tier (or go to 0 for unlimited)."""
        basic_limits = TIER_LIMITS['basic']
        pro_limits = TIER_LIMITS['pro']
        enterprise_limits = TIER_LIMITS['enterprise']

        # Basic -> Pro should increase
        assert pro_limits.max_agents > basic_limits.max_agents
        assert pro_limits.max_policies > basic_limits.max_policies

        # Enterprise uses 0 for unlimited, so direct comparison doesn't work
        # But retention should increase
        assert enterprise_limits.event_retention_days > pro_limits.event_retention_days

    def test_none_tier_has_zero_limits(self):
        """Test that none tier has all zero limits."""
        limits = TIER_LIMITS['none']
        assert limits.max_agents == 0
        assert limits.max_policies == 0
        assert limits.event_retention_days == 0
