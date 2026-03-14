"""
License Hierarchy Service - Manages parent/child license relationships.

Enterprise customers can have a parent organization with a master license
that provisions child licenses to subsidiary organizations. This enables:
- Centralized license management
- Entitlement inheritance (optional)
- Hierarchical usage tracking and billing
- Delegated administration

Usage:
    from zentinelle.services.license_hierarchy_service import license_hierarchy_service

    # Create a child license
    child_license = license_hierarchy_service.create_child_license(
        parent_license=parent_license,
        child_org=subsidiary_org,
        entitlements={'ai_gateway': True}
    )

    # Propagate entitlements from parent to all children
    license_hierarchy_service.propagate_entitlements(parent_license)
"""
import logging
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple

from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@dataclass
class HierarchyValidationResult:
    """Result of hierarchy validation."""
    is_valid: bool
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class LicenseHierarchyService:
    """
    Service for managing enterprise license hierarchies.

    This service handles:
    - Creating child licenses under a parent
    - Validating hierarchy constraints
    - Propagating entitlements from parent to children
    - Transferring licenses between parents
    """

    def create_child_license(
        self,
        parent_license: 'License',
        child_org: 'Organization',
        entitlements: Optional[Dict] = None,
        max_deployments: int = 1,
        max_agents: int = 50,
        max_users: int = 25,
        inherit_entitlements: bool = True,
    ) -> Tuple['License', Optional[str]]:
        """
        Create a child license under a parent license.

        Args:
            parent_license: The parent license (must be enterprise tier)
            child_org: The child organization to license
            entitlements: Optional specific entitlements (subset of parent's)
            max_deployments: Max deployments for child
            max_agents: Max agents for child
            max_users: Max users for child
            inherit_entitlements: Whether child inherits from parent

        Returns:
            Tuple of (License object, error_message)
            License is None if creation failed, error_message is None if succeeded
        """
        from zentinelle.models import License
        from organization.models import Organization

        # Validate parent license
        validation = self.validate_parent_for_child(parent_license)
        if not validation.is_valid:
            return None, validation.error

        # Validate child organization doesn't already have a license
        existing_license = License.objects.filter(
            organization=child_org,
            status=License.Status.ACTIVE
        ).first()
        if existing_license:
            return None, f"Organization {child_org.name} already has an active license"

        # If inheriting, validate entitlements are subset of parent's
        if inherit_entitlements and entitlements:
            for key in entitlements:
                if key not in parent_license.features:
                    return None, f"Entitlement '{key}' not available in parent license"

        # Determine features
        if entitlements is None and inherit_entitlements:
            # Start with parent features
            features = dict(parent_license.features)
        elif entitlements:
            features = entitlements
        else:
            features = {}

        # Validate limits don't exceed parent (unless parent is unlimited)
        parent_limits = parent_license.get_effective_limits()
        for limit_name, child_value in [
            ('max_deployments', max_deployments),
            ('max_agents', max_agents),
            ('max_users', max_users)
        ]:
            parent_value = parent_limits[limit_name]
            if parent_value != -1 and child_value > parent_value:
                return None, f"Child {limit_name} ({child_value}) exceeds parent limit ({parent_value})"

        try:
            with transaction.atomic():
                child_license = License.objects.create(
                    organization=child_org,
                    subscription=None,  # Child licenses don't have their own subscription
                    license_type=parent_license.license_type,
                    status=License.Status.ACTIVE,
                    billing_model=parent_license.billing_model,
                    max_deployments=max_deployments,
                    max_agents=max_agents,
                    max_users=max_users,
                    features=features,
                    valid_from=timezone.now(),
                    valid_until=parent_license.valid_until,  # Inherit expiration
                    bill_infrastructure=parent_license.bill_infrastructure,
                    bill_api_tokens=parent_license.bill_api_tokens,
                    # Hierarchy fields
                    parent_license=parent_license,
                    is_parent_license=False,
                    inherit_entitlements=inherit_entitlements,
                )

                # Optionally link organization to parent org
                if child_org.parent_organization is None:
                    child_org.parent_organization = parent_license.organization
                    child_org.license_inheritance_enabled = inherit_entitlements
                    child_org.save(update_fields=[
                        'parent_organization',
                        'license_inheritance_enabled',
                        'updated_at'
                    ])

                logger.info(
                    f"Created child license {child_license.id} for org {child_org.name} "
                    f"under parent {parent_license.id}"
                )

                return child_license, None

        except Exception as e:
            logger.exception(f"Failed to create child license: {e}")
            return None, f"Failed to create child license: {str(e)}"

    def get_child_licenses(
        self,
        parent_license: 'License',
        include_inactive: bool = False
    ) -> List['License']:
        """
        Get all child licenses for a parent license.

        Args:
            parent_license: The parent license
            include_inactive: Whether to include inactive/revoked licenses

        Returns:
            List of child License objects
        """
        from zentinelle.models import License

        queryset = parent_license.child_licenses.all()
        if not include_inactive:
            queryset = queryset.filter(status=License.Status.ACTIVE)
        return list(queryset.select_related('organization'))

    def get_parent_license(self, license_obj: 'License') -> Optional['License']:
        """
        Get the parent license for a given license.

        Args:
            license_obj: The license to find parent for

        Returns:
            Parent License object or None
        """
        return license_obj.parent_license

    def propagate_entitlements(
        self,
        parent_license: 'License',
        force: bool = False
    ) -> Tuple[int, List[str]]:
        """
        Propagate entitlements from parent to all child licenses.

        This updates child licenses that have inherit_entitlements=True
        to match the parent's feature set.

        Args:
            parent_license: The parent license
            force: If True, update all children regardless of inherit_entitlements

        Returns:
            Tuple of (number of updated licenses, list of errors)
        """
        from zentinelle.models import License

        updated_count = 0
        errors = []

        children = self.get_child_licenses(parent_license)

        for child in children:
            if not force and not child.inherit_entitlements:
                continue

            try:
                # Update features to match parent
                child.features = dict(parent_license.features)

                # Update expiration to match parent
                if parent_license.valid_until:
                    child.valid_until = parent_license.valid_until

                child.save(update_fields=['features', 'valid_until', 'updated_at'])
                updated_count += 1

                logger.info(
                    f"Propagated entitlements to child license {child.id} "
                    f"for org {child.organization.name}"
                )

            except Exception as e:
                error_msg = f"Failed to update child {child.id}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)

        return updated_count, errors

    def validate_parent_for_child(
        self,
        parent_license: 'License'
    ) -> HierarchyValidationResult:
        """
        Validate that a license can be used as a parent for new children.

        Args:
            parent_license: The license to validate

        Returns:
            HierarchyValidationResult with validation status
        """
        from zentinelle.models import License

        # Must be active
        if parent_license.status != License.Status.ACTIVE:
            return HierarchyValidationResult(
                is_valid=False,
                error="Parent license is not active"
            )

        # Must be a parent license
        if not parent_license.is_parent_license:
            return HierarchyValidationResult(
                is_valid=False,
                error="License is not configured as a parent license"
            )

        # Check if organization is enterprise tier
        if parent_license.organization.tier != 'enterprise':
            return HierarchyValidationResult(
                is_valid=False,
                error="Parent/child license hierarchy requires enterprise tier"
            )

        # Check child license limit
        if not parent_license.can_add_child_license:
            return HierarchyValidationResult(
                is_valid=False,
                error=f"Parent license has reached maximum child limit ({parent_license.max_child_licenses})"
            )

        return HierarchyValidationResult(
            is_valid=True,
            details={
                'current_children': parent_license.child_license_count,
                'max_children': parent_license.max_child_licenses,
            }
        )

    def validate_hierarchy_limits(
        self,
        parent_license: 'License'
    ) -> HierarchyValidationResult:
        """
        Validate that a parent license's hierarchy is within limits.

        This checks:
        - Total child count vs max_child_licenses
        - Aggregate resource usage across all children

        Args:
            parent_license: The parent license to validate

        Returns:
            HierarchyValidationResult with validation status
        """
        from zentinelle.models import License

        children = self.get_child_licenses(parent_license)

        # Check child count
        child_count = len(children)
        if parent_license.max_child_licenses != -1:
            if child_count > parent_license.max_child_licenses:
                return HierarchyValidationResult(
                    is_valid=False,
                    error=f"Child license count ({child_count}) exceeds limit ({parent_license.max_child_licenses})"
                )

        # Aggregate resource usage
        total_deployments = sum(c.max_deployments for c in children if c.max_deployments != -1)
        total_agents = sum(c.max_agents for c in children if c.max_agents != -1)
        total_users = sum(c.max_users for c in children if c.max_users != -1)

        details = {
            'child_count': child_count,
            'max_children': parent_license.max_child_licenses,
            'aggregate_max_deployments': total_deployments,
            'aggregate_max_agents': total_agents,
            'aggregate_max_users': total_users,
        }

        return HierarchyValidationResult(
            is_valid=True,
            details=details
        )

    def transfer_child_license(
        self,
        child_license: 'License',
        new_parent_license: 'License'
    ) -> Tuple[bool, Optional[str]]:
        """
        Transfer a child license to a new parent.

        Args:
            child_license: The child license to transfer
            new_parent_license: The new parent license

        Returns:
            Tuple of (success, error_message)
        """
        from zentinelle.models import License

        # Validate current license is a child
        if not child_license.is_child_license:
            return False, "License is not a child license"

        # Validate new parent
        validation = self.validate_parent_for_child(new_parent_license)
        if not validation.is_valid:
            return False, f"New parent invalid: {validation.error}"

        # If inheriting entitlements, validate features are available in new parent
        if child_license.inherit_entitlements:
            for feature in child_license.features:
                if feature not in new_parent_license.features:
                    return False, f"Feature '{feature}' not available in new parent"

        try:
            old_parent = child_license.parent_license
            child_license.parent_license = new_parent_license
            child_license.save(update_fields=['parent_license', 'updated_at'])

            # Optionally update organization parent
            child_license.organization.parent_organization = new_parent_license.organization
            child_license.organization.save(update_fields=['parent_organization', 'updated_at'])

            logger.info(
                f"Transferred child license {child_license.id} from parent {old_parent.id} "
                f"to new parent {new_parent_license.id}"
            )

            return True, None

        except Exception as e:
            logger.exception(f"Failed to transfer child license: {e}")
            return False, f"Failed to transfer: {str(e)}"

    def revoke_child_license(
        self,
        child_license: 'License',
        reason: str = ""
    ) -> Tuple[bool, Optional[str]]:
        """
        Revoke a child license.

        Args:
            child_license: The child license to revoke
            reason: Optional reason for revocation

        Returns:
            Tuple of (success, error_message)
        """
        from zentinelle.models import License

        if not child_license.is_child_license:
            return False, "License is not a child license"

        try:
            child_license.status = License.Status.REVOKED
            if reason:
                child_license.notes = f"{child_license.notes}\nRevoked: {reason}".strip()
            child_license.save(update_fields=['status', 'notes', 'updated_at'])

            logger.info(
                f"Revoked child license {child_license.id} for org {child_license.organization.name}"
            )

            return True, None

        except Exception as e:
            logger.exception(f"Failed to revoke child license: {e}")
            return False, f"Failed to revoke: {str(e)}"

    def update_child_entitlements(
        self,
        child_license: 'License',
        entitlements: Dict[str, Any],
        limits: Optional[Dict[str, int]] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Update the entitlements and/or limits for a child license.

        Args:
            child_license: The child license to update
            entitlements: New entitlements dict
            limits: Optional dict with max_deployments, max_agents, max_users

        Returns:
            Tuple of (success, error_message)
        """
        if not child_license.is_child_license:
            return False, "License is not a child license"

        parent = child_license.parent_license
        if not parent:
            return False, "Child license has no parent"

        # Validate entitlements don't exceed parent's
        if child_license.inherit_entitlements:
            for key in entitlements:
                if key not in parent.features:
                    return False, f"Entitlement '{key}' not available in parent"

        # Validate limits don't exceed parent's
        if limits:
            parent_limits = parent.get_effective_limits()
            for key, value in limits.items():
                if key in parent_limits:
                    parent_value = parent_limits[key]
                    if parent_value != -1 and value > parent_value:
                        return False, f"Limit {key} ({value}) exceeds parent ({parent_value})"

        try:
            child_license.features = entitlements
            if limits:
                if 'max_deployments' in limits:
                    child_license.max_deployments = limits['max_deployments']
                if 'max_agents' in limits:
                    child_license.max_agents = limits['max_agents']
                if 'max_users' in limits:
                    child_license.max_users = limits['max_users']

            child_license.save()

            logger.info(f"Updated entitlements for child license {child_license.id}")
            return True, None

        except Exception as e:
            logger.exception(f"Failed to update child entitlements: {e}")
            return False, f"Failed to update: {str(e)}"

    def get_hierarchy_tree(
        self,
        parent_license: 'License'
    ) -> Dict[str, Any]:
        """
        Get the full hierarchy tree for a parent license.

        Returns a nested dict representing the license hierarchy.

        Args:
            parent_license: The root parent license

        Returns:
            Dict with license info and nested children
        """
        def license_to_dict(license_obj: 'License') -> Dict[str, Any]:
            return {
                'id': str(license_obj.id),
                'organization_id': str(license_obj.organization_id),
                'organization_name': license_obj.organization.name,
                'status': license_obj.status,
                'license_type': license_obj.license_type,
                'features': license_obj.get_effective_features(),
                'limits': license_obj.get_effective_limits(),
                'inherit_entitlements': license_obj.inherit_entitlements,
                'children': [
                    license_to_dict(child)
                    for child in license_obj.child_licenses.filter(
                        status=license_obj.Status.ACTIVE
                    ).select_related('organization')
                ]
            }

        return license_to_dict(parent_license)


# Singleton instance
license_hierarchy_service = LicenseHierarchyService()
