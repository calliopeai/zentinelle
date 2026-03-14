"""
Zentinelle Tier Service - Centralized tier management and feature gating.

This service defines the tier hierarchy, feature mappings, and limits for
Zentinelle (AI Governance). It provides a single source of truth for tier-based
access control throughout the application.

Tier Hierarchy (Priority Order - Lowest to Highest):
====================================================

1. NONE (0)    - Zentinelle not enabled
2. BASIC (1)   - Basic governance features
3. PRO (2)     - Professional tier with advanced features
4. ENTERPRISE (3) - Full enterprise capabilities

Higher tiers include all features from lower tiers. For example:
- PRO includes all BASIC features
- ENTERPRISE includes all PRO and BASIC features

Usage:
------
    from zentinelle.services.tier_service import zentinelle_tier_service

    # Check if a feature is available
    if zentinelle_tier_service.check_feature_available(org, 'advanced_policies'):
        # Feature is enabled
        pass

    # Get all features for an org's tier
    features = zentinelle_tier_service.get_tier_features(org.zentinelle_tier)

    # Get tier limits
    limits = zentinelle_tier_service.get_tier_limits(org.zentinelle_tier)
"""
from dataclasses import dataclass
from typing import TYPE_CHECKING, Dict, List, Optional, Set, Tuple

if TYPE_CHECKING:
    from organization.models import Organization


# =============================================================================
# Tier Constants and Priority Order
# =============================================================================

class ZentinelleTiers:
    """
    Zentinelle tier constants.

    Tiers are ordered by priority (lowest to highest):
    NONE (0) < BASIC (1) < PRO (2) < ENTERPRISE (3)

    Higher-priority tiers include all features from lower-priority tiers.
    """
    NONE = 'none'
    BASIC = 'basic'
    PRO = 'pro'
    ENTERPRISE = 'enterprise'

    # Ordered list of tiers (lowest to highest priority)
    ALL_TIERS = [NONE, BASIC, PRO, ENTERPRISE]

    # Priority values for comparison
    PRIORITY = {
        NONE: 0,
        BASIC: 1,
        PRO: 2,
        ENTERPRISE: 3,
    }

    @classmethod
    def is_valid(cls, tier: str) -> bool:
        """Check if a tier value is valid."""
        return tier in cls.ALL_TIERS

    @classmethod
    def get_priority(cls, tier: str) -> int:
        """
        Get the priority level of a tier.

        Args:
            tier: Tier value

        Returns:
            Priority integer (0 = lowest, 3 = highest)

        Raises:
            ValueError: If tier is not valid
        """
        if tier not in cls.PRIORITY:
            raise ValueError(f"Invalid tier: {tier}. Valid tiers: {cls.ALL_TIERS}")
        return cls.PRIORITY[tier]

    @classmethod
    def compare(cls, tier1: str, tier2: str) -> int:
        """
        Compare two tiers.

        Args:
            tier1: First tier
            tier2: Second tier

        Returns:
            -1 if tier1 < tier2
             0 if tier1 == tier2
             1 if tier1 > tier2
        """
        p1 = cls.get_priority(tier1)
        p2 = cls.get_priority(tier2)
        if p1 < p2:
            return -1
        elif p1 > p2:
            return 1
        return 0

    @classmethod
    def is_tier_at_least(cls, current_tier: str, required_tier: str) -> bool:
        """
        Check if current tier meets or exceeds required tier.

        Args:
            current_tier: The tier to check
            required_tier: The minimum required tier

        Returns:
            True if current_tier >= required_tier in priority order
        """
        return cls.get_priority(current_tier) >= cls.get_priority(required_tier)


# =============================================================================
# Feature Definitions
# =============================================================================

class ZentinelleFeatures:
    """
    Available Zentinelle features.

    Features are organized by category and tier requirement.
    """
    # Basic Tier Features
    POLICY_MANAGEMENT = 'policy_management'
    BASIC_MONITORING = 'basic_monitoring'
    EVENT_LOGGING = 'event_logging'
    CONTENT_SCANNING = 'content_scanning'
    AGENT_ENDPOINTS = 'agent_endpoints'

    # Pro Tier Features
    ADVANCED_POLICIES = 'advanced_policies'
    COMPLIANCE_REPORTS = 'compliance_reports'
    AI_MODEL_REGISTRY = 'ai_model_registry'
    BUDGET_CONTROLS = 'budget_controls'
    CUSTOM_RULES = 'custom_rules'
    ALERT_CONFIGURATIONS = 'alert_configurations'
    USAGE_ANALYTICS = 'usage_analytics'

    # Enterprise Tier Features
    AUDIT_LOGS = 'audit_logs'
    SSO_INTEGRATION = 'sso_integration'
    CUSTOM_INTEGRATIONS = 'custom_integrations'
    PRIORITY_SUPPORT = 'priority_support'
    DEDICATED_SUCCESS_MANAGER = 'dedicated_success_manager'
    RETENTION_POLICIES = 'retention_policies'
    LEGAL_HOLDS = 'legal_holds'
    RISK_MANAGEMENT = 'risk_management'
    INCIDENT_MANAGEMENT = 'incident_management'
    POLICY_DOCUMENTS = 'policy_documents'
    COMPLIANCE_CHECKS = 'compliance_checks'
    MULTI_REGION = 'multi_region'
    CUSTOM_BRANDING = 'custom_branding'


# Feature mapping by tier
# Each tier includes its own features PLUS all features from lower tiers
TIER_FEATURES: Dict[str, List[str]] = {
    ZentinelleTiers.NONE: [],
    ZentinelleTiers.BASIC: [
        ZentinelleFeatures.POLICY_MANAGEMENT,
        ZentinelleFeatures.BASIC_MONITORING,
        ZentinelleFeatures.EVENT_LOGGING,
        ZentinelleFeatures.CONTENT_SCANNING,
        ZentinelleFeatures.AGENT_ENDPOINTS,
    ],
    ZentinelleTiers.PRO: [
        # Inherits BASIC features
        ZentinelleFeatures.POLICY_MANAGEMENT,
        ZentinelleFeatures.BASIC_MONITORING,
        ZentinelleFeatures.EVENT_LOGGING,
        ZentinelleFeatures.CONTENT_SCANNING,
        ZentinelleFeatures.AGENT_ENDPOINTS,
        # Pro-specific features
        ZentinelleFeatures.ADVANCED_POLICIES,
        ZentinelleFeatures.COMPLIANCE_REPORTS,
        ZentinelleFeatures.AI_MODEL_REGISTRY,
        ZentinelleFeatures.BUDGET_CONTROLS,
        ZentinelleFeatures.CUSTOM_RULES,
        ZentinelleFeatures.ALERT_CONFIGURATIONS,
        ZentinelleFeatures.USAGE_ANALYTICS,
    ],
    ZentinelleTiers.ENTERPRISE: [
        # Inherits all BASIC and PRO features
        ZentinelleFeatures.POLICY_MANAGEMENT,
        ZentinelleFeatures.BASIC_MONITORING,
        ZentinelleFeatures.EVENT_LOGGING,
        ZentinelleFeatures.CONTENT_SCANNING,
        ZentinelleFeatures.AGENT_ENDPOINTS,
        ZentinelleFeatures.ADVANCED_POLICIES,
        ZentinelleFeatures.COMPLIANCE_REPORTS,
        ZentinelleFeatures.AI_MODEL_REGISTRY,
        ZentinelleFeatures.BUDGET_CONTROLS,
        ZentinelleFeatures.CUSTOM_RULES,
        ZentinelleFeatures.ALERT_CONFIGURATIONS,
        ZentinelleFeatures.USAGE_ANALYTICS,
        # Enterprise-specific features
        ZentinelleFeatures.AUDIT_LOGS,
        ZentinelleFeatures.SSO_INTEGRATION,
        ZentinelleFeatures.CUSTOM_INTEGRATIONS,
        ZentinelleFeatures.PRIORITY_SUPPORT,
        ZentinelleFeatures.DEDICATED_SUCCESS_MANAGER,
        ZentinelleFeatures.RETENTION_POLICIES,
        ZentinelleFeatures.LEGAL_HOLDS,
        ZentinelleFeatures.RISK_MANAGEMENT,
        ZentinelleFeatures.INCIDENT_MANAGEMENT,
        ZentinelleFeatures.POLICY_DOCUMENTS,
        ZentinelleFeatures.COMPLIANCE_CHECKS,
        ZentinelleFeatures.MULTI_REGION,
        ZentinelleFeatures.CUSTOM_BRANDING,
    ],
}

# Mapping of feature to minimum required tier
FEATURE_REQUIRED_TIER: Dict[str, str] = {
    # Basic tier features
    ZentinelleFeatures.POLICY_MANAGEMENT: ZentinelleTiers.BASIC,
    ZentinelleFeatures.BASIC_MONITORING: ZentinelleTiers.BASIC,
    ZentinelleFeatures.EVENT_LOGGING: ZentinelleTiers.BASIC,
    ZentinelleFeatures.CONTENT_SCANNING: ZentinelleTiers.BASIC,
    ZentinelleFeatures.AGENT_ENDPOINTS: ZentinelleTiers.BASIC,
    # Pro tier features
    ZentinelleFeatures.ADVANCED_POLICIES: ZentinelleTiers.PRO,
    ZentinelleFeatures.COMPLIANCE_REPORTS: ZentinelleTiers.PRO,
    ZentinelleFeatures.AI_MODEL_REGISTRY: ZentinelleTiers.PRO,
    ZentinelleFeatures.BUDGET_CONTROLS: ZentinelleTiers.PRO,
    ZentinelleFeatures.CUSTOM_RULES: ZentinelleTiers.PRO,
    ZentinelleFeatures.ALERT_CONFIGURATIONS: ZentinelleTiers.PRO,
    ZentinelleFeatures.USAGE_ANALYTICS: ZentinelleTiers.PRO,
    # Enterprise tier features
    ZentinelleFeatures.AUDIT_LOGS: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.SSO_INTEGRATION: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.CUSTOM_INTEGRATIONS: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.PRIORITY_SUPPORT: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.DEDICATED_SUCCESS_MANAGER: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.RETENTION_POLICIES: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.LEGAL_HOLDS: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.RISK_MANAGEMENT: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.INCIDENT_MANAGEMENT: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.POLICY_DOCUMENTS: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.COMPLIANCE_CHECKS: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.MULTI_REGION: ZentinelleTiers.ENTERPRISE,
    ZentinelleFeatures.CUSTOM_BRANDING: ZentinelleTiers.ENTERPRISE,
}


# =============================================================================
# Tier Limits
# =============================================================================

@dataclass
class TierLimits:
    """Resource limits for a Zentinelle tier."""
    # Agent limits
    max_agents: int
    max_policies: int
    max_content_rules: int
    max_ai_models: int

    # Event/log retention
    event_retention_days: int
    audit_log_retention_days: int

    # Rate limits (per minute)
    api_requests_per_minute: int
    events_per_minute: int

    # Alert limits
    max_alert_rules: int
    max_notification_channels: int

    # Integration limits
    max_webhooks: int
    max_sso_providers: int


# Limits by tier
TIER_LIMITS: Dict[str, TierLimits] = {
    ZentinelleTiers.NONE: TierLimits(
        max_agents=0,
        max_policies=0,
        max_content_rules=0,
        max_ai_models=0,
        event_retention_days=0,
        audit_log_retention_days=0,
        api_requests_per_minute=0,
        events_per_minute=0,
        max_alert_rules=0,
        max_notification_channels=0,
        max_webhooks=0,
        max_sso_providers=0,
    ),
    ZentinelleTiers.BASIC: TierLimits(
        max_agents=10,
        max_policies=5,
        max_content_rules=20,
        max_ai_models=5,
        event_retention_days=30,
        audit_log_retention_days=30,
        api_requests_per_minute=100,
        events_per_minute=500,
        max_alert_rules=5,
        max_notification_channels=2,
        max_webhooks=0,
        max_sso_providers=0,
    ),
    ZentinelleTiers.PRO: TierLimits(
        max_agents=50,
        max_policies=25,
        max_content_rules=100,
        max_ai_models=25,
        event_retention_days=90,
        audit_log_retention_days=90,
        api_requests_per_minute=500,
        events_per_minute=2000,
        max_alert_rules=25,
        max_notification_channels=10,
        max_webhooks=5,
        max_sso_providers=0,
    ),
    ZentinelleTiers.ENTERPRISE: TierLimits(
        max_agents=0,  # 0 = unlimited
        max_policies=0,  # 0 = unlimited
        max_content_rules=0,  # 0 = unlimited
        max_ai_models=0,  # 0 = unlimited
        event_retention_days=365,
        audit_log_retention_days=730,  # 2 years
        api_requests_per_minute=0,  # 0 = unlimited
        events_per_minute=0,  # 0 = unlimited
        max_alert_rules=0,  # 0 = unlimited
        max_notification_channels=0,  # 0 = unlimited
        max_webhooks=0,  # 0 = unlimited
        max_sso_providers=0,  # 0 = unlimited
    ),
}


# =============================================================================
# Tier Display Information
# =============================================================================

TIER_DISPLAY_INFO: Dict[str, Dict] = {
    ZentinelleTiers.NONE: {
        'name': 'None',
        'display_name': 'Not Enabled',
        'description': 'Zentinelle AI Governance is not enabled for this organization.',
        'color': 'gray',
    },
    ZentinelleTiers.BASIC: {
        'name': 'Basic',
        'display_name': 'Basic',
        'description': 'Essential AI governance with policy management, monitoring, and content scanning.',
        'color': 'blue',
    },
    ZentinelleTiers.PRO: {
        'name': 'Professional',
        'display_name': 'Professional',
        'description': 'Advanced governance with compliance reports, model registry, and custom rules.',
        'color': 'purple',
    },
    ZentinelleTiers.ENTERPRISE: {
        'name': 'Enterprise',
        'display_name': 'Enterprise',
        'description': 'Full enterprise capabilities with audit logs, SSO, custom integrations, and dedicated support.',
        'color': 'gold',
    },
}


# =============================================================================
# Tier Service
# =============================================================================

class ZentinelleTierService:
    """
    Service for checking Zentinelle tier features and limits.

    This is the primary interface for tier-based access control.
    Use this service instead of directly checking tier values.
    """

    def __init__(self):
        self._tiers = ZentinelleTiers
        self._features = ZentinelleFeatures

    @property
    def tiers(self) -> type:
        """Get the ZentinelleTiers class for tier constants."""
        return self._tiers

    @property
    def features(self) -> type:
        """Get the ZentinelleFeatures class for feature constants."""
        return self._features

    def is_valid_tier(self, tier: str) -> bool:
        """
        Check if a tier value is valid.

        Args:
            tier: Tier value to check

        Returns:
            True if valid tier
        """
        return ZentinelleTiers.is_valid(tier)

    def get_all_tiers(self) -> List[str]:
        """
        Get all valid tier values in priority order.

        Returns:
            List of tier values from lowest to highest priority
        """
        return list(ZentinelleTiers.ALL_TIERS)

    def get_tier_priority(self, tier: str) -> int:
        """
        Get the priority level of a tier.

        Args:
            tier: Tier value

        Returns:
            Priority integer (0-3, higher = more features)
        """
        return ZentinelleTiers.get_priority(tier)

    def get_tier_features(self, tier: str) -> List[str]:
        """
        Get all features available for a tier.

        Args:
            tier: Tier value

        Returns:
            List of feature names available for this tier
        """
        if not self.is_valid_tier(tier):
            return []
        return list(TIER_FEATURES.get(tier, []))

    def get_tier_features_set(self, tier: str) -> Set[str]:
        """
        Get features as a set for efficient lookups.

        Args:
            tier: Tier value

        Returns:
            Set of feature names
        """
        return set(self.get_tier_features(tier))

    def get_tier_limits(self, tier: str) -> TierLimits:
        """
        Get resource limits for a tier.

        Args:
            tier: Tier value

        Returns:
            TierLimits dataclass with limit values
        """
        if not self.is_valid_tier(tier):
            return TIER_LIMITS[ZentinelleTiers.NONE]
        return TIER_LIMITS.get(tier, TIER_LIMITS[ZentinelleTiers.NONE])

    def get_tier_display_info(self, tier: str) -> Dict:
        """
        Get display information for a tier (name, description, color).

        Args:
            tier: Tier value

        Returns:
            Dict with display information
        """
        if not self.is_valid_tier(tier):
            return TIER_DISPLAY_INFO[ZentinelleTiers.NONE]
        return TIER_DISPLAY_INFO.get(tier, TIER_DISPLAY_INFO[ZentinelleTiers.NONE])

    def get_feature_required_tier(self, feature: str) -> Optional[str]:
        """
        Get the minimum tier required for a feature.

        Args:
            feature: Feature name

        Returns:
            Tier value or None if feature not found
        """
        return FEATURE_REQUIRED_TIER.get(feature)

    def is_feature_in_tier(self, feature: str, tier: str) -> bool:
        """
        Check if a feature is included in a specific tier.

        Args:
            feature: Feature name
            tier: Tier value

        Returns:
            True if feature is included in the tier
        """
        return feature in self.get_tier_features_set(tier)

    def check_feature_available(
        self,
        organization: 'Organization',
        feature: str
    ) -> Tuple[bool, str]:
        """
        Check if a feature is available for an organization.

        This is the primary method for feature gating.

        Args:
            organization: Organization model instance
            feature: Feature name from ZentinelleFeatures

        Returns:
            Tuple of (available: bool, message: str)
            - If available: (True, "Feature available on {tier} tier")
            - If not available: (False, "Feature requires {tier} tier")
        """
        current_tier = organization.zentinelle_tier

        if current_tier == ZentinelleTiers.NONE:
            return False, "Zentinelle is not enabled for this organization"

        if self.is_feature_in_tier(feature, current_tier):
            tier_info = self.get_tier_display_info(current_tier)
            return True, f"Feature available on {tier_info['name']} tier"

        required_tier = self.get_feature_required_tier(feature)
        if required_tier:
            tier_info = self.get_tier_display_info(required_tier)
            return False, f"Feature requires {tier_info['name']} tier or higher"

        return False, f"Unknown feature: {feature}"

    def check_limit(
        self,
        organization: 'Organization',
        limit_name: str,
        current_count: int
    ) -> Tuple[bool, str]:
        """
        Check if an organization is within a resource limit.

        Args:
            organization: Organization model instance
            limit_name: Name of the limit (e.g., 'max_agents', 'max_policies')
            current_count: Current usage count

        Returns:
            Tuple of (within_limit: bool, message: str)
        """
        limits = self.get_tier_limits(organization.zentinelle_tier)
        limit_value = getattr(limits, limit_name, None)

        if limit_value is None:
            return False, f"Unknown limit: {limit_name}"

        if limit_value == 0:
            # 0 means unlimited
            return True, "Unlimited"

        if current_count < limit_value:
            remaining = limit_value - current_count
            return True, f"{remaining} remaining (limit: {limit_value})"

        tier_info = self.get_tier_display_info(organization.zentinelle_tier)
        return False, f"Limit reached ({limit_value}) on {tier_info['name']} tier"

    def get_org_tier_info(self, organization: 'Organization') -> Dict:
        """
        Get comprehensive tier information for an organization.

        Useful for displaying tier status in the UI.

        Args:
            organization: Organization model instance

        Returns:
            Dict with tier, features, limits, and display info
        """
        tier = organization.zentinelle_tier
        return {
            'tier': tier,
            'priority': self.get_tier_priority(tier),
            'display': self.get_tier_display_info(tier),
            'features': self.get_tier_features(tier),
            'limits': self.get_tier_limits(tier),
            'is_enabled': tier != ZentinelleTiers.NONE,
        }

    def compare_tiers(self, tier1: str, tier2: str) -> int:
        """
        Compare two tiers.

        Args:
            tier1: First tier
            tier2: Second tier

        Returns:
            -1 if tier1 < tier2, 0 if equal, 1 if tier1 > tier2
        """
        return ZentinelleTiers.compare(tier1, tier2)

    def is_tier_at_least(self, current_tier: str, required_tier: str) -> bool:
        """
        Check if current tier meets or exceeds required tier.

        Args:
            current_tier: The tier to check
            required_tier: The minimum required tier

        Returns:
            True if current_tier >= required_tier
        """
        return ZentinelleTiers.is_tier_at_least(current_tier, required_tier)

    def get_upgrade_path(self, current_tier: str) -> Optional[str]:
        """
        Get the next tier in the upgrade path.

        Args:
            current_tier: Current tier

        Returns:
            Next higher tier, or None if already at highest tier
        """
        priority = self.get_tier_priority(current_tier)
        for tier, tier_priority in ZentinelleTiers.PRIORITY.items():
            if tier_priority == priority + 1:
                return tier
        return None

    def get_features_in_upgrade(self, current_tier: str) -> List[str]:
        """
        Get features that would be unlocked by upgrading to the next tier.

        Args:
            current_tier: Current tier

        Returns:
            List of feature names available in next tier but not current
        """
        next_tier = self.get_upgrade_path(current_tier)
        if not next_tier:
            return []

        current_features = self.get_tier_features_set(current_tier)
        next_features = self.get_tier_features_set(next_tier)
        return list(next_features - current_features)


# Singleton instance for convenience
zentinelle_tier_service = ZentinelleTierService()
