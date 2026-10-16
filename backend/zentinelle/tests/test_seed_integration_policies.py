"""The policies an integration starts with, seeded in audit mode (installer#431).

The installer runs `seed_integration_policies` once when Zentinelle is enabled
with the Workbench or Astrolift. It creates what is missing, never touches what
an operator has, and what it creates alerts and never blocks, under enforce too.
"""
import io

from django.core.management import CommandError, call_command
from django.test import TestCase

from zentinelle.models import AgentEndpoint, Policy
from zentinelle.services.policy_engine import PolicyEngine

TENANT = '00000000-0000-0000-0000-000000000001'
OTHER = 'tenant-b'
SEEDED = {'agent_delegation', 'human_oversight', 'budget_limit'}


def seed(tenant=TENANT, source='workbench'):
    out = io.StringIO()
    call_command('seed_integration_policies', '--tenant', tenant, '--source', source, stdout=out)
    return out.getvalue()


class SeedTests(TestCase):

    def test_the_three_policies_are_created_org_wide_in_audit_mode_with_alert(self):
        output = seed()

        policies = Policy.objects.filter(tenant_id=TENANT)
        self.assertEqual({p.policy_type for p in policies}, SEEDED)
        for policy in policies:
            self.assertEqual((policy.scope_type, policy.enforcement, policy.action, policy.enabled),
                             ('organization', 'audit', 'alert', True))
            self.assertIn('the Workbench', policy.description)
            self.assertIn(f'created {policy.policy_type}', output)
        budget = Policy.objects.get(tenant_id=TENANT, policy_type='budget_limit').config
        self.assertEqual((budget['monthly_budget_usd'], budget['alert_threshold_percent'], budget['hard_limit']),
                         (500, 80, False))
        self.assertIn('3 created, 0 already present', output)
        self.assertFalse(Policy.objects.filter(tenant_id=OTHER).exists())

    def test_running_it_again_creates_nothing(self):
        seed()
        output = seed(source='astrolift')

        self.assertEqual(Policy.objects.filter(tenant_id=TENANT).count(), 3)
        self.assertIn('0 created, 3 already present', output)

    def test_an_operators_policy_of_a_type_is_kept_as_it_is(self):
        mine = Policy.objects.create(tenant_id=TENANT, name='Team budget', policy_type='budget_limit',
                                     config={'monthly_budget_usd': 50, 'hard_limit': True})

        output = seed()

        mine.refresh_from_db()
        self.assertEqual((mine.name, mine.enforcement, mine.config['monthly_budget_usd'], mine.version),
                         ('Team budget', 'enforce', 50, 1))
        self.assertEqual(Policy.objects.filter(tenant_id=TENANT, policy_type='budget_limit').count(), 1)
        self.assertIn('skipped budget_limit: the tenant has "Team budget" already', output)
        self.assertEqual({p.policy_type for p in Policy.objects.filter(tenant_id=TENANT)}, SEEDED)

    def test_a_policy_of_the_type_in_another_tenant_does_not_count(self):
        Policy.objects.create(tenant_id=OTHER, name='Theirs', policy_type='human_oversight', config={})

        seed()

        self.assertEqual({p.policy_type for p in Policy.objects.filter(tenant_id=TENANT)}, SEEDED)

    def test_a_tenant_and_a_known_source_are_required(self):
        for args in (['--tenant', ' ', '--source', 'workbench'], ['--tenant', TENANT, '--source', 'other']):
            with self.subTest(args=args), self.assertRaises(CommandError):
                call_command('seed_integration_policies', *args, stdout=io.StringIO())
        self.assertFalse(Policy.objects.exists())

    def evaluate_a_risky_spawn(self):
        _, key_hash, prefix = AgentEndpoint.generate_api_key()
        endpoint = AgentEndpoint.objects.create(tenant_id=TENANT, agent_id='agent-1', name='agent-1',
                                                api_key_hash=key_hash, api_key_prefix=prefix)

        return PolicyEngine().evaluate(endpoint, 'agent:spawn', 'user-1', {
            'has_sensitive_data': True, 'delegation_depth': 9, 'parent_agent_id': 'agent-0',
        })

    def test_what_they_match_alerts_and_is_never_blocked(self):
        seed()

        result = self.evaluate_a_risky_spawn()

        self.assertTrue(result.allowed)
        self.assertEqual(result.enforcement['action'], 'alert')
        self.assertTrue(any('Human approval required' in w for w in result.warnings))
        self.assertTrue(any('Delegation depth 9' in w for w in result.warnings))

    def test_switched_to_enforce_they_alert_rather_than_block(self):
        seed()
        Policy.objects.filter(tenant_id=TENANT).update(enforcement='enforce')

        result = self.evaluate_a_risky_spawn()

        self.assertTrue(result.allowed)
        self.assertEqual(result.enforcement['action'], 'alert')
