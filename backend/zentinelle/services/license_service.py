"""
License Service - Handles license generation and validation.

Supports three modes:
1. Dev Mode - CALLIOPE_DEV_MODE=true bypasses license
2. Connected Mode - Online validation via API
3. Air-Gapped Mode - Offline validation via signed license token

For air-gapped deployments, licenses are signed with HMAC-SHA256.
The signature ensures the license hasn't been tampered with.
"""
import os
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone as dt_timezone
from dataclasses import dataclass

from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class LicenseValidationResult:
    """Result of license validation."""
    is_valid: bool
    mode: str  # 'dev', 'connected', 'offline'
    error: Optional[str] = None
    license_data: Optional[Dict[str, Any]] = None
    org_id: Optional[str] = None
    deployment_id: Optional[str] = None
    features: Optional[list] = None
    expires_at: Optional[datetime] = None
    # Grace period information
    in_grace_period: bool = False
    grace_period_info: Optional[Dict[str, Any]] = None


class LicenseService:
    """
    Service for generating and validating licenses.

    Validation is a database lookup. There is no signed offline token, and
    that is deliberate (#262): the tokens this service used to mint were
    signed with HMAC-SHA256 under a key that ships in this repository, and
    this repository is MIT. Symmetric signing can prove a token was not
    altered in transit; it cannot prove Calliope Labs issued it, because
    anyone holding the source holds the key. A licence anyone can mint is not
    a licence, and a check against one asserts something untrue.

    Setting LICENSE_SIGNING_KEY in production did not help either: the party
    the token would prove something to is the same party holding the key.

    So the token is gone rather than re-keyed. Zentinelle AI ships MIT and is
    free to use, self-host, modify and redistribute; the paid thing is a
    service we operate and gate on our side. If something ever must be gated
    inside a customer's copy it needs asymmetric signing — RS256 against a
    public key baked into the image, the way JunoHub does it — and that is a
    decision to take deliberately rather than a key rotation.

    Usage:
        service = LicenseService()
        result = service.validate()
    """

    @property
    def is_dev_mode(self) -> bool:
        """Check if running in dev mode."""
        return os.environ.get('CALLIOPE_DEV_MODE', '').lower() in ('true', '1', 'yes')

    def _get_entitled_tools(self, tenant_id) -> list:
        """
        Get the list of entitled tools for a tenant.

        Returns list of tool IDs from the tenant's plan bundle. The billing
        package is a managed-cloud component and is absent from a standalone
        install, which the except below already accounts for.
        """
        try:
            from billing.entitlement_service import entitlement_service
            entitlements = entitlement_service.get_entitlements(tenant_id)
            return entitlements.entitled_tools or []
        except Exception as e:
            logger.warning(f"Failed to get entitled tools for org {organization.id}: {e}")
            return []

    def validate_online(self, license_key: str) -> LicenseValidationResult:
        """
        Validate license via database lookup.

        Supports grace periods: when license validation fails due to
        payment issues or expiration, the license may be in a grace period
        where access is still allowed but with warnings.

        Args:
            license_key: The license key to validate

        Returns:
            LicenseValidationResult with validation status and grace period info
        """
        from zentinelle.models import License
        from zentinelle.services.grace_period_service import get_grace_period_service

        try:
            license_obj = License.get_by_key(license_key)
            if not license_obj:
                return LicenseValidationResult(
                    is_valid=False,
                    mode='connected',
                    error='Invalid license key'
                )

            # Check grace period status first
            grace_service = get_grace_period_service()
            grace_status = grace_service.check_grace_period_status(license_obj)

            # If grace period has expired, hard block
            if grace_status.should_hard_block:
                return LicenseValidationResult(
                    is_valid=False,
                    mode='connected',
                    error='License grace period has expired. Please resolve the issue to restore access.',
                    org_id=str(license_obj.tenant_id),
                    in_grace_period=False,
                    grace_period_info=grace_status.to_dict()
                )

            # Now validate the license itself
            is_valid, error = license_obj.validate()

            if not is_valid:
                # Check if we're in a grace period (validation failed but grace period active)
                if grace_status.in_grace_period:
                    # Allow access during grace period, but include warning info
                    logger.info(
                        f"License {license_obj.id} validation failed ({error}) "
                        f"but in grace period ({grace_status.days_remaining} days remaining)"
                    )
                    return LicenseValidationResult(
                        is_valid=True,  # Allow access during grace period
                        mode='connected',
                        error=error,  # Include the error as a warning
                        license_data={
                            'license_key': license_obj.license_key,
                            'org_id': str(license_obj.tenant_id),
                            'license_type': license_obj.license_type,
                            'features': license_obj.features,
                        },
                        org_id=str(license_obj.tenant_id),
                        features=list(license_obj.features.keys()) if isinstance(license_obj.features, dict) else license_obj.features,
                        expires_at=license_obj.valid_until,
                        in_grace_period=True,
                        grace_period_info=grace_status.to_dict()
                    )
                else:
                    # License invalid and not in grace period
                    return LicenseValidationResult(
                        is_valid=False,
                        mode='connected',
                        error=error,
                        org_id=str(license_obj.tenant_id),
                        in_grace_period=False,
                        grace_period_info=None
                    )

            # License is valid, check if we need to clear any previous grace period
            if license_obj.grace_period_started:
                grace_service.end_grace_period(license_obj)

            return LicenseValidationResult(
                is_valid=True,
                mode='connected',
                license_data={
                    'license_key': license_obj.license_key,
                    'org_id': str(license_obj.tenant_id),
                    'license_type': license_obj.license_type,
                    'features': license_obj.features,
                },
                org_id=str(license_obj.tenant_id),
                features=list(license_obj.features.keys()) if isinstance(license_obj.features, dict) else license_obj.features,
                expires_at=license_obj.valid_until,
                in_grace_period=False,
                grace_period_info=None
            )

        except Exception as e:
            logger.error(f"License validation error: {e}")
            return LicenseValidationResult(
                is_valid=False,
                mode='connected',
                error=f'Validation error: {e}'
            )

    def validate(
        self,
        license_key: Optional[str] = None,
        offline_token: Optional[str] = None
    ) -> LicenseValidationResult:
        """
        Validate license using the appropriate mode.

        Priority:
        1. Dev mode (CALLIOPE_DEV_MODE=true)
        2. Offline token (if provided or CALLIOPE_OFFLINE_LICENSE env)
        3. Online validation (if license_key provided)

        Args:
            license_key: Optional license key for online validation
            offline_token: Optional offline token for air-gapped validation

        Returns:
            LicenseValidationResult with validation status
        """
        # Check dev mode first
        if self.is_dev_mode:
            logger.info("License validation: DEV MODE enabled")
            return LicenseValidationResult(
                is_valid=True,
                mode='dev',
                license_data={'dev_mode': True},
                features=['*'],  # All features in dev mode
            )

        # An offline token is no longer accepted. A deployment still setting
        # CALLIOPE_OFFLINE_LICENSE is told so, rather than falling through to
        # another mode and being given a result about something else.
        if offline_token or os.environ.get('CALLIOPE_OFFLINE_LICENSE'):
            logger.warning(
                "An offline licence token was supplied. Offline tokens were removed "
                "in #262: they were signed with a key that ships in MIT source, so "
                "they proved nothing. Use a licence key."
            )
            return LicenseValidationResult(
                is_valid=False,
                mode='offline',
                error=(
                    'Offline licence tokens are no longer supported. They were signed '
                    'with a symmetric key published in this repository, so anyone '
                    'could mint one and they proved nothing.'
                ),
            )

        # Check for license key
        key = license_key or os.environ.get('CALLIOPE_LICENSE_KEY')
        if key:
            logger.info("License validation: Using online validation")
            return self.validate_online(key)

        # No license provided
        return LicenseValidationResult(
            is_valid=False,
            mode='none',
            error='No license key or token provided'
        )

# Convenience functions
def validate_license(
    license_key: Optional[str] = None,
    offline_token: Optional[str] = None
) -> LicenseValidationResult:
    """Validate license using appropriate mode."""
    service = LicenseService()
    return service.validate(license_key, offline_token)


def is_dev_mode() -> bool:
    """Check if running in dev mode."""
    return LicenseService().is_dev_mode
