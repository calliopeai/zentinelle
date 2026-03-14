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
import hmac
import hashlib
import base64
import json
import logging
from typing import Optional, Tuple, Dict, Any
from datetime import datetime, timezone as dt_timezone
from dataclasses import dataclass

from django.conf import settings
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

    Usage:
        service = LicenseService()

        # Generate offline license
        token = service.generate_offline_token(license_obj)

        # Validate (checks all modes)
        result = service.validate()
    """

    # Default signing key (should be overridden in production)
    DEFAULT_SIGNING_KEY = 'calliope-dev-signing-key-replace-in-production'

    def __init__(self, signing_key: Optional[str] = None):
        self.signing_key = signing_key or getattr(
            settings, 'LICENSE_SIGNING_KEY',
            os.environ.get('LICENSE_SIGNING_KEY', self.DEFAULT_SIGNING_KEY)
        )

    @property
    def is_dev_mode(self) -> bool:
        """Check if running in dev mode."""
        return os.environ.get('CALLIOPE_DEV_MODE', '').lower() in ('true', '1', 'yes')

    def _get_entitled_tools(self, organization) -> list:
        """
        Get the list of entitled tools for an organization.

        Returns list of tool IDs from the organization's plan bundle.
        """
        try:
            from billing.entitlement_service import entitlement_service
            entitlements = entitlement_service.get_entitlements(organization)
            return entitlements.entitled_tools or []
        except Exception as e:
            logger.warning(f"Failed to get entitled tools for org {organization.id}: {e}")
            return []

    def generate_offline_token(self, license_obj) -> str:
        """
        Generate a signed offline license token.

        The token contains all necessary license data and a signature
        that can be verified without calling home.

        Args:
            license_obj: License model instance

        Returns:
            Base64-encoded signed token string
        """
        # Get entitled tools from organization's entitlements
        entitled_tools = self._get_entitled_tools(license_obj.organization)

        payload = {
            'license_key': license_obj.license_key,
            'org_id': str(license_obj.organization.id),
            'org_slug': license_obj.organization.slug,
            'license_type': license_obj.license_type,
            'features': license_obj.features,
            'max_deployments': license_obj.max_deployments,
            'max_agents': license_obj.max_agents,
            'max_users': license_obj.max_users,
            'entitled_tools': entitled_tools,
            'valid_from': license_obj.valid_from.isoformat() if license_obj.valid_from else None,
            'valid_until': license_obj.valid_until.isoformat() if license_obj.valid_until else None,
            'issued_at': timezone.now().isoformat(),
            'offline_allowed': True,
        }

        # Sign the payload
        payload_json = json.dumps(payload, sort_keys=True)
        signature = self._sign(payload_json)

        # Combine payload and signature
        token_data = {
            'payload': payload,
            'signature': signature,
            'version': 1,
        }

        # Base64 encode for easy transport
        token_json = json.dumps(token_data)
        token_b64 = base64.urlsafe_b64encode(token_json.encode()).decode()

        return token_b64

    def validate_offline_token(self, token: str) -> LicenseValidationResult:
        """
        Validate an offline license token.

        Args:
            token: Base64-encoded signed token

        Returns:
            LicenseValidationResult with validation status
        """
        try:
            # Decode token
            token_json = base64.urlsafe_b64decode(token.encode()).decode()
            token_data = json.loads(token_json)

            payload = token_data.get('payload', {})
            signature = token_data.get('signature', '')

            # Verify signature
            payload_json = json.dumps(payload, sort_keys=True)
            expected_signature = self._sign(payload_json)

            if not hmac.compare_digest(signature, expected_signature):
                return LicenseValidationResult(
                    is_valid=False,
                    mode='offline',
                    error='Invalid license signature'
                )

            # Check expiration
            valid_until = payload.get('valid_until')
            if valid_until:
                expires = datetime.fromisoformat(valid_until)
                if expires.tzinfo is None:
                    expires = expires.replace(tzinfo=dt_timezone.utc)
                if expires < datetime.now(dt_timezone.utc):
                    return LicenseValidationResult(
                        is_valid=False,
                        mode='offline',
                        error='License has expired',
                        expires_at=expires
                    )

            return LicenseValidationResult(
                is_valid=True,
                mode='offline',
                license_data=payload,
                org_id=payload.get('org_id'),
                features=payload.get('features', []),
                expires_at=datetime.fromisoformat(valid_until) if valid_until else None
            )

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            return LicenseValidationResult(
                is_valid=False,
                mode='offline',
                error=f'Invalid license token format: {e}'
            )

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
                    org_id=str(license_obj.organization.id),
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
                            'org_id': str(license_obj.organization.id),
                            'license_type': license_obj.license_type,
                            'features': license_obj.features,
                        },
                        org_id=str(license_obj.organization.id),
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
                        org_id=str(license_obj.organization.id),
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
                    'org_id': str(license_obj.organization.id),
                    'license_type': license_obj.license_type,
                    'features': license_obj.features,
                },
                org_id=str(license_obj.organization.id),
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

        # Check for offline token
        token = offline_token or os.environ.get('CALLIOPE_OFFLINE_LICENSE')
        if token:
            logger.info("License validation: Using offline token")
            return self.validate_offline_token(token)

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

    def _sign(self, data: str) -> str:
        """Sign data using HMAC-SHA256."""
        signature = hmac.new(
            self.signing_key.encode(),
            data.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature


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


def generate_offline_license(license_obj) -> str:
    """Generate offline license token for a license."""
    service = LicenseService()
    return service.generate_offline_token(license_obj)
