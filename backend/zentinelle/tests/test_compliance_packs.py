"""
Tests for the compliance packs service (zentinelle.services.compliance_packs).

All tests use unittest.mock — no database required.
"""
import unittest
from unittest.mock import MagicMock, patch, call


VALID_POLICY_TYPES = {
    'system_prompt', 'ai_guardrail', 'model_restriction', 'context_limit',
    'output_filter', 'agent_capability', 'agent_memory', 'human_oversight',
    'resource_quota', 'budget_limit', 'rate_limit', 'tool_permission',
    'network_policy', 'secret_access', 'data_access', 'audit_policy',
    'session_policy', 'data_retention',
}


class TestListPacks(unittest.TestCase):
    """test_list_packs_returns_five_packs"""

    def test_list_packs_returns_five_packs(self):
        from zentinelle.services.compliance_packs import list_packs

        packs = list_packs()
        names = {p['name'] for p in packs}
        self.assertIn('hipaa', names)
        self.assertIn('soc2', names)
        self.assertIn('gdpr', names)
        self.assertIn('eu_ai_act', names)
        self.assertIn('nist_ai_rmf', names)
        self.assertEqual(len(packs), 5)

    def test_list_packs_metadata_shape(self):
        """Each pack metadata entry has the expected keys and no policy list."""
        from zentinelle.services.compliance_packs import list_packs

        for pack in list_packs():
            self.assertIn('name', pack)
            self.assertIn('display_name', pack)
            self.assertIn('version', pack)
            self.assertIn('description', pack)
            self.assertIn('policy_count', pack)
            self.assertNotIn('policies', pack)
            self.assertGreater(pack['policy_count'], 0)


class TestGetPack(unittest.TestCase):
    """test_get_pack_hipaa and test_get_pack_unknown_returns_none"""

    def test_get_pack_hipaa(self):
        from zentinelle.services.compliance_packs import get_pack

        pack = get_pack('hipaa')
        self.assertIsNotNone(pack)
        self.assertEqual(pack['name'], 'hipaa')
        self.assertIn('policies', pack)
        self.assertIsInstance(pack['policies'], list)
        self.assertGreater(len(pack['policies']), 0)

    def test_get_pack_unknown_returns_none(self):
        from zentinelle.services.compliance_packs import get_pack

        result = get_pack('nonexistent_framework_xyz')
        self.assertIsNone(result)

    def test_get_pack_all_known_packs(self):
        from zentinelle.services.compliance_packs import get_pack

        for name in ('hipaa', 'soc2', 'gdpr', 'eu_ai_act'):
            pack = get_pack(name)
            self.assertIsNotNone(pack, f"Pack '{name}' should exist")
            self.assertEqual(pack['name'], name)


class TestActivatePack(unittest.TestCase):
    """test_activate_pack_creates_policies and test_activate_pack_unknown_raises"""

    @patch('zentinelle.models.Policy')
    def test_activate_pack_creates_policies(self, MockPolicy):
        from zentinelle.services.compliance_packs import activate_pack, get_pack

        pack = get_pack('hipaa')
        expected_policy_count = len(pack['policies'])

        # Simulate all policies being newly created
        MockPolicy.objects.update_or_create.return_value = (MagicMock(), True)

        result = activate_pack(tenant_id='tenant-abc', pack_name='hipaa')

        self.assertEqual(result['pack'], 'hipaa')
        self.assertIn('version', result)
        self.assertEqual(result['policies_created'], expected_policy_count)
        self.assertEqual(result['policies_updated'], 0)
        self.assertEqual(MockPolicy.objects.update_or_create.call_count, expected_policy_count)

    @patch('zentinelle.models.Policy')
    def test_activate_pack_updates_existing_policies(self, MockPolicy):
        from zentinelle.services.compliance_packs import activate_pack, get_pack

        pack = get_pack('soc2')
        expected_policy_count = len(pack['policies'])

        # Simulate all policies already existing
        MockPolicy.objects.update_or_create.return_value = (MagicMock(), False)

        result = activate_pack(tenant_id='tenant-abc', pack_name='soc2')

        self.assertEqual(result['policies_created'], 0)
        self.assertEqual(result['policies_updated'], expected_policy_count)

    @patch('zentinelle.models.Policy')
    def test_activate_pack_passes_tenant_id(self, MockPolicy):
        from zentinelle.services.compliance_packs import activate_pack

        MockPolicy.objects.update_or_create.return_value = (MagicMock(), True)
        activate_pack(tenant_id='my-tenant', pack_name='gdpr')

        for c in MockPolicy.objects.update_or_create.call_args_list:
            kwargs = c.kwargs if c.kwargs else c[1]
            self.assertEqual(kwargs.get('tenant_id'), 'my-tenant')

    @patch('zentinelle.models.Policy')
    def test_activate_pack_enforcement_override(self, MockPolicy):
        from zentinelle.services.compliance_packs import activate_pack

        MockPolicy.objects.update_or_create.return_value = (MagicMock(), True)
        activate_pack(tenant_id='t1', pack_name='hipaa', enforcement='audit')

        for c in MockPolicy.objects.update_or_create.call_args_list:
            defaults = c.kwargs.get('defaults', c[1].get('defaults', {}))
            self.assertEqual(defaults.get('enforcement'), 'audit')

    def test_activate_pack_unknown_raises(self):
        from zentinelle.services.compliance_packs import activate_pack

        with self.assertRaises(ValueError) as ctx:
            activate_pack(tenant_id='t1', pack_name='iso27001_doesnt_exist')

        self.assertIn('iso27001_doesnt_exist', str(ctx.exception))


class TestAllPacksUseValidPolicyTypes(unittest.TestCase):
    """test_all_packs_use_valid_policy_types"""

    def test_all_packs_use_valid_policy_types(self):
        from zentinelle.services.compliance_packs import COMPLIANCE_PACKS

        for pack_name, pack in COMPLIANCE_PACKS.items():
            for policy in pack['policies']:
                policy_type = policy['policy_type']
                self.assertIn(
                    policy_type,
                    VALID_POLICY_TYPES,
                    msg=(
                        f"Pack '{pack_name}', policy '{policy['name']}' has "
                        f"invalid policy_type='{policy_type}'. "
                        f"Valid types: {sorted(VALID_POLICY_TYPES)}"
                    ),
                )

    def test_all_packs_have_required_policy_fields(self):
        from zentinelle.services.compliance_packs import COMPLIANCE_PACKS

        required_fields = {'name', 'policy_type', 'enforcement', 'priority', 'config'}
        for pack_name, pack in COMPLIANCE_PACKS.items():
            for policy in pack['policies']:
                missing = required_fields - set(policy.keys())
                self.assertFalse(
                    missing,
                    msg=f"Pack '{pack_name}', policy '{policy.get('name')}' missing fields: {missing}",
                )

    def test_all_packs_have_at_least_three_policies(self):
        from zentinelle.services.compliance_packs import COMPLIANCE_PACKS

        for pack_name, pack in COMPLIANCE_PACKS.items():
            self.assertGreaterEqual(
                len(pack['policies']),
                3,
                msg=f"Pack '{pack_name}' should have at least 3 policies",
            )

    def test_pack_enforcement_values_are_valid(self):
        from zentinelle.services.compliance_packs import COMPLIANCE_PACKS

        valid_enforcement = {'enforce', 'audit', 'disabled'}
        for pack_name, pack in COMPLIANCE_PACKS.items():
            for policy in pack['policies']:
                self.assertIn(
                    policy['enforcement'],
                    valid_enforcement,
                    msg=f"Pack '{pack_name}', policy '{policy['name']}' has invalid enforcement",
                )


if __name__ == '__main__':
    unittest.main()
