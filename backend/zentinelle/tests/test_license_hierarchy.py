"""
Tests for enterprise license hierarchy (parent/child) functionality.
"""
import pytest
from django.test import TestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch, MagicMock

from organization.models import Organization
from zentinelle.models import License
from zentinelle.services.license_hierarchy_service import (
    license_hierarchy_service,
    HierarchyValidationResult,
)

User = get_user_model()


class LicenseHierarchyModelTest(TestCase):
    """Tests for License model hierarchy fields and methods."""

    def setUp(self):
        # Parent organization (enterprise tier)
        self.parent_org = Organization.objects.create(
            name="Parent Corp",
            tier=Organization.Tier.ENTERPRISE
        )
        # Child organization
        self.child_org = Organization.objects.create(
            name="Child Subsidiary",
            tier=Organization.Tier.BYOC
        )

        # Parent license
        self.parent_license = License.objects.create(
            organization=self.parent_org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            is_parent_license=True,
            max_child_licenses=5,
            max_deployments=-1,  # Unlimited
            max_agents=-1,
            max_users=-1,
            features={
                'ai_gateway': True,
                'custom_images': True,
                'sso': True,
                'dedicated_support': True
            },
        )

    def test_is_parent_license(self):
        """Test is_parent_license flag."""
        self.assertTrue(self.parent_license.is_parent_license)

    def test_is_child_license_false_for_parent(self):
        """Test is_child_license is False for parent license."""
        self.assertFalse(self.parent_license.is_child_license)

    def test_child_license_count_initially_zero(self):
        """Test child_license_count is 0 initially."""
        self.assertEqual(self.parent_license.child_license_count, 0)

    def test_can_add_child_license(self):
        """Test can_add_child_license returns True when under limit."""
        self.assertTrue(self.parent_license.can_add_child_license)

    def test_can_add_child_license_at_limit(self):
        """Test can_add_child_license returns False at limit."""
        self.parent_license.max_child_licenses = 0
        self.parent_license.save()
        self.assertFalse(self.parent_license.can_add_child_license)

    def test_can_add_child_license_unlimited(self):
        """Test can_add_child_license with unlimited (-1)."""
        self.parent_license.max_child_licenses = -1
        self.parent_license.save()
        self.assertTrue(self.parent_license.can_add_child_license)

    def test_get_effective_features_no_parent(self):
        """Test get_effective_features returns own features when no parent."""
        features = self.parent_license.get_effective_features()
        self.assertEqual(features, self.parent_license.features)

    def test_get_effective_limits_no_parent(self):
        """Test get_effective_limits returns own limits when no parent."""
        limits = self.parent_license.get_effective_limits()
        self.assertEqual(limits['max_deployments'], -1)
        self.assertEqual(limits['max_agents'], -1)
        self.assertEqual(limits['max_users'], -1)

    def test_validate_hierarchy_constraints_valid(self):
        """Test validate_hierarchy_constraints on valid parent."""
        is_valid, error = self.parent_license.validate_hierarchy_constraints()
        self.assertTrue(is_valid)
        self.assertEqual(error, "")


class LicenseHierarchyServiceTest(TestCase):
    """Tests for LicenseHierarchyService."""

    def setUp(self):
        # Parent organization (enterprise)
        self.parent_org = Organization.objects.create(
            name="Parent Corp",
            tier=Organization.Tier.ENTERPRISE
        )
        # Child organizations
        self.child_org_1 = Organization.objects.create(
            name="Child 1",
            tier=Organization.Tier.BYOC
        )
        self.child_org_2 = Organization.objects.create(
            name="Child 2",
            tier=Organization.Tier.BYOC
        )

        # Parent license
        self.parent_license = License.objects.create(
            organization=self.parent_org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            is_parent_license=True,
            max_child_licenses=5,
            max_deployments=-1,
            max_agents=1000,
            max_users=500,
            features={
                'ai_gateway': True,
                'custom_images': True,
                'sso': True,
            },
        )

    def test_create_child_license_success(self):
        """Test creating a child license successfully."""
        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            max_deployments=2,
            max_agents=50,
            max_users=25,
        )

        self.assertIsNotNone(child_license)
        self.assertIsNone(error)
        self.assertEqual(child_license.organization, self.child_org_1)
        self.assertEqual(child_license.parent_license, self.parent_license)
        self.assertTrue(child_license.is_child_license)
        self.assertFalse(child_license.is_parent_license)
        self.assertTrue(child_license.inherit_entitlements)

    def test_create_child_license_inherits_features(self):
        """Test child license inherits parent features."""
        child_license, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        self.assertEqual(child_license.features, self.parent_license.features)

    def test_create_child_license_custom_entitlements(self):
        """Test creating child with custom (subset) entitlements."""
        custom_features = {'ai_gateway': True}  # Subset of parent

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            entitlements=custom_features,
        )

        self.assertIsNotNone(child_license)
        self.assertIsNone(error)
        self.assertEqual(child_license.features, custom_features)

    def test_create_child_license_fails_feature_not_in_parent(self):
        """Test creating child fails if feature not in parent."""
        custom_features = {'premium_feature': True}  # Not in parent

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            entitlements=custom_features,
            inherit_entitlements=True,
        )

        self.assertIsNone(child_license)
        self.assertIn("not available", error)

    def test_create_child_license_fails_not_parent_license(self):
        """Test creating child fails if parent is not a parent license."""
        self.parent_license.is_parent_license = False
        self.parent_license.save()

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        self.assertIsNone(child_license)
        self.assertIn("not configured as a parent", error)

    def test_create_child_license_fails_not_enterprise(self):
        """Test creating child fails if org not enterprise tier."""
        self.parent_org.tier = Organization.Tier.BYOC
        self.parent_org.save()

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        self.assertIsNone(child_license)
        self.assertIn("enterprise tier", error)

    def test_create_child_license_fails_at_limit(self):
        """Test creating child fails when at limit."""
        self.parent_license.max_child_licenses = 0
        self.parent_license.save()

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        self.assertIsNone(child_license)
        self.assertIn("maximum child limit", error)

    def test_create_child_license_fails_org_already_licensed(self):
        """Test creating child fails if org already has a license."""
        # Create existing license for child org
        License.objects.create(
            organization=self.child_org_1,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
        )

        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        self.assertIsNone(child_license)
        self.assertIn("already has an active license", error)

    def test_create_child_license_fails_limits_exceed_parent(self):
        """Test creating child fails if limits exceed parent."""
        child_license, error = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            max_agents=2000,  # Parent has 1000
        )

        self.assertIsNone(child_license)
        self.assertIn("exceeds parent limit", error)

    def test_get_child_licenses(self):
        """Test getting all child licenses."""
        license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )
        license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_2,
        )

        children = license_hierarchy_service.get_child_licenses(self.parent_license)
        self.assertEqual(len(children), 2)

    def test_get_child_licenses_excludes_inactive(self):
        """Test get_child_licenses excludes inactive by default."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )
        child.status = License.Status.REVOKED
        child.save()

        children = license_hierarchy_service.get_child_licenses(self.parent_license)
        self.assertEqual(len(children), 0)

        children = license_hierarchy_service.get_child_licenses(
            self.parent_license, include_inactive=True
        )
        self.assertEqual(len(children), 1)

    def test_get_parent_license(self):
        """Test getting parent license from child."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        parent = license_hierarchy_service.get_parent_license(child)
        self.assertEqual(parent, self.parent_license)

    def test_propagate_entitlements(self):
        """Test propagating entitlements to children."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            entitlements={'ai_gateway': True},  # Start with subset
        )

        # Update parent features
        self.parent_license.features['new_feature'] = True
        self.parent_license.save()

        # Propagate
        updated, errors = license_hierarchy_service.propagate_entitlements(
            self.parent_license
        )

        self.assertEqual(updated, 1)
        self.assertEqual(len(errors), 0)

        child.refresh_from_db()
        self.assertIn('new_feature', child.features)

    def test_propagate_entitlements_skips_non_inheriting(self):
        """Test propagation skips children with inherit_entitlements=False."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            inherit_entitlements=False,
        )
        child.features = {'custom_only': True}
        child.save()

        updated, _ = license_hierarchy_service.propagate_entitlements(
            self.parent_license
        )

        self.assertEqual(updated, 0)
        child.refresh_from_db()
        self.assertEqual(child.features, {'custom_only': True})

    def test_transfer_child_license(self):
        """Test transferring child to new parent."""
        # Create second parent
        new_parent_org = Organization.objects.create(
            name="New Parent Corp",
            tier=Organization.Tier.ENTERPRISE
        )
        new_parent_license = License.objects.create(
            organization=new_parent_org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            is_parent_license=True,
            max_child_licenses=10,
            features=self.parent_license.features,
        )

        # Create child under original parent
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        # Transfer
        success, error = license_hierarchy_service.transfer_child_license(
            child_license=child,
            new_parent_license=new_parent_license
        )

        self.assertTrue(success)
        self.assertIsNone(error)

        child.refresh_from_db()
        self.assertEqual(child.parent_license, new_parent_license)

    def test_revoke_child_license(self):
        """Test revoking a child license."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        success, error = license_hierarchy_service.revoke_child_license(
            child_license=child,
            reason="Contract terminated"
        )

        self.assertTrue(success)
        self.assertIsNone(error)

        child.refresh_from_db()
        self.assertEqual(child.status, License.Status.REVOKED)
        self.assertIn("Contract terminated", child.notes)

    def test_update_child_entitlements(self):
        """Test updating child entitlements."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )

        new_entitlements = {'ai_gateway': True, 'sso': True}  # Subset of parent
        success, error = license_hierarchy_service.update_child_entitlements(
            child_license=child,
            entitlements=new_entitlements,
            limits={'max_deployments': 5, 'max_agents': 100}
        )

        self.assertTrue(success)
        self.assertIsNone(error)

        child.refresh_from_db()
        self.assertEqual(child.features, new_entitlements)
        self.assertEqual(child.max_deployments, 5)
        self.assertEqual(child.max_agents, 100)

    def test_get_hierarchy_tree(self):
        """Test getting the full hierarchy tree."""
        license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
        )
        license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_2,
        )

        tree = license_hierarchy_service.get_hierarchy_tree(self.parent_license)

        self.assertEqual(tree['organization_name'], 'Parent Corp')
        self.assertEqual(len(tree['children']), 2)
        child_names = [c['organization_name'] for c in tree['children']]
        self.assertIn('Child 1', child_names)
        self.assertIn('Child 2', child_names)

    def test_validate_hierarchy_limits(self):
        """Test validating hierarchy limits."""
        license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org_1,
            max_deployments=10,
            max_agents=100,
            max_users=50,
        )

        result = license_hierarchy_service.validate_hierarchy_limits(
            self.parent_license
        )

        self.assertTrue(result.is_valid)
        self.assertEqual(result.details['child_count'], 1)
        self.assertEqual(result.details['aggregate_max_deployments'], 10)


class ChildLicenseEffectiveFeaturesTest(TestCase):
    """Tests for child license effective feature/limit inheritance."""

    def setUp(self):
        self.parent_org = Organization.objects.create(
            name="Parent Corp",
            tier=Organization.Tier.ENTERPRISE
        )
        self.child_org = Organization.objects.create(
            name="Child Org",
            tier=Organization.Tier.BYOC
        )

        self.parent_license = License.objects.create(
            organization=self.parent_org,
            license_type=License.LicenseType.MANAGED,
            status=License.Status.ACTIVE,
            is_parent_license=True,
            max_child_licenses=10,
            max_deployments=100,
            max_agents=500,
            max_users=200,
            features={
                'ai_gateway': True,
                'custom_images': True,
                'rate_limit': 1000,
            },
        )

    def test_child_effective_features_with_inheritance(self):
        """Test child effective features when inheriting."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org,
            inherit_entitlements=True,
        )

        effective = child.get_effective_features()
        self.assertEqual(effective, self.parent_license.features)

    def test_child_effective_features_restricts_boolean(self):
        """Test child can restrict boolean features."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org,
            inherit_entitlements=True,
        )
        # Child disables custom_images
        child.features = {'custom_images': False}
        child.save()

        effective = child.get_effective_features()
        # Parent has True, child has False, result is False (AND)
        self.assertFalse(effective['custom_images'])
        # Other features from parent remain
        self.assertTrue(effective['ai_gateway'])

    def test_child_effective_limits_capped_by_parent(self):
        """Test child limits are capped by parent limits."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org,
            max_deployments=50,  # Less than parent's 100
            max_agents=50,
            max_users=50,
            inherit_entitlements=True,
        )

        limits = child.get_effective_limits()
        self.assertEqual(limits['max_deployments'], 50)  # Child's limit (lower)

    def test_child_with_unlimited_capped_by_parent(self):
        """Test child with unlimited (-1) is capped by parent's limit."""
        child, _ = license_hierarchy_service.create_child_license(
            parent_license=self.parent_license,
            child_org=self.child_org,
            max_deployments=1,  # Will try to update to unlimited
            inherit_entitlements=True,
        )
        # Try to set unlimited
        child.max_deployments = -1
        child.save()

        limits = child.get_effective_limits()
        # Should be capped at parent's 100, not unlimited
        self.assertEqual(limits['max_deployments'], 100)
