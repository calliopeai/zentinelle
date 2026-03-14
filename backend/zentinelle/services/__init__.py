"""
Zentinelle Services - Agent-level GRC services.

Deployment-level services (DeploymentManager, etc.) are in the `deployments` app.
CRM services (HubSpotService) are in the `organization` app.
"""
from zentinelle.services.policy_engine import PolicyEngine, EvaluationResult
from zentinelle.services.secrets_service import SecretsService
from zentinelle.services.event_store import (
    EventStore,
    EventEnvelope,
    DeadLetterQueue,
    AuditLogProjection,
    event_store,
    dead_letter_queue,
)
from zentinelle.services.license_service import (
    LicenseService,
    LicenseValidationResult,
    validate_license,
    is_dev_mode,
    generate_offline_license,
)
from zentinelle.services.notification_service import (
    NotificationService,
    get_notification_service,
)
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
from zentinelle.services.grace_period_service import (
    GracePeriodService,
    GracePeriodStatus,
    get_grace_period_service,
    GRACE_PERIOD_DURATIONS,
)

__all__ = [
    'PolicyEngine',
    'EvaluationResult',
    'SecretsService',
    # Event Sourcing
    'EventStore',
    'EventEnvelope',
    'DeadLetterQueue',
    'AuditLogProjection',
    'event_store',
    'dead_letter_queue',
    # License Service
    'LicenseService',
    'LicenseValidationResult',
    'validate_license',
    'is_dev_mode',
    'generate_offline_license',
    # Notification Service
    'NotificationService',
    'get_notification_service',
    # Tier Service
    'ZentinelleTierService',
    'ZentinelleTiers',
    'ZentinelleFeatures',
    'TierLimits',
    'zentinelle_tier_service',
    'TIER_FEATURES',
    'TIER_LIMITS',
    'FEATURE_REQUIRED_TIER',
    # Grace Period Service
    'GracePeriodService',
    'GracePeriodStatus',
    'get_grace_period_service',
    'GRACE_PERIOD_DURATIONS',
]
