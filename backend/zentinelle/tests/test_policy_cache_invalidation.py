"""A policy that has been saved is the policy that gets enforced (#216).

`PolicyEngine.evaluate` caches its decision under a key carrying the tenant's
policy version, and the version only moves when something bumps it. The four
GraphQL mutations bumped it by hand, and every other writer did not: the LLM
assistant creates policies in `services/llm_tools.py`, the Django admin saves
them through a ModelAdmin, and a policy document applies them through its own
mutation. Each of those left a decision cached for up to POLICY_CACHE_TTL —
five minutes in which an agent a new blocking policy forbids goes on being
allowed.

That is the failure these tests are about, so they exercise the *model*, not
the mutations: what has to hold is that saving a policy invalidates, whoever
saved it.
"""
from django.core.cache import cache
from django.test import TestCase

from zentinelle.models import AgentEndpoint, Policy
from zentinelle.services.policy_engine import PolicyEngine

STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'


class PolicyCacheInvalidationTest(TestCase):
    def setUp(self):
        cache.clear()
        _, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='cache-agent',
            name='Cache Agent',
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
        )

    def _version(self):
        return cache.get(f'policies_version:{STANDALONE_TENANT}', 0)

    def _policy(self, **overrides):
        fields = dict(
            tenant_id=STANDALONE_TENANT,
            name='Blocks the thing',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enabled=True,
            config={'max_requests': 1, 'window_seconds': 60},
        )
        fields.update(overrides)
        return Policy.objects.create(**fields)

    def test_creating_a_policy_moves_the_version(self):
        before = self._version()
        self._policy()
        self.assertNotEqual(
            self._version(),
            before,
            'a created policy left the cache version where it was, so evaluate() '
            'goes on serving the decision it cached before the policy existed',
        )

    def test_saving_a_policy_moves_the_version(self):
        policy = self._policy()
        before = self._version()
        policy.enabled = False
        policy.save()
        self.assertNotEqual(
            self._version(),
            before,
            'disabling a policy left the cache version where it was',
        )

    def test_deleting_a_policy_moves_the_version(self):
        policy = self._policy()
        before = self._version()
        policy.delete()
        self.assertNotEqual(
            self._version(),
            before,
            'deleting a policy left the cache version where it was, so evaluate() '
            'goes on enforcing a rule that no longer exists',
        )

    def test_a_policy_written_outside_a_mutation_is_enforced_immediately(self):
        """The whole point, end to end and through the cache.

        Resolve the effective policies once so a result is cached, then create a
        policy the way `services/llm_tools.py` does — a bare `objects.create`,
        no mutation, no explicit invalidation — and resolve again. The second
        answer has to include it rather than come back from the entry cached
        before it existed.
        """
        engine = PolicyEngine()
        self.assertEqual(engine.get_effective_policies(endpoint=self.endpoint), [])

        created = self._policy(name='Written by the assistant')

        again = engine.get_effective_policies(endpoint=self.endpoint)
        self.assertEqual(
            [p.id for p in again],
            [created.id],
            'the new policy was not returned: get_effective_policies answered from '
            'the cache entry written before it existed, which is the five-minute '
            'enforcement gap #216 is about',
        )

    def test_a_write_for_one_tenant_does_not_invalidate_another(self):
        other = '00000000-0000-0000-0000-0000000000ff'
        PolicyEngine().invalidate_cache(other)
        before = cache.get(f'policies_version:{other}', 0)
        self._policy()
        self.assertEqual(
            cache.get(f'policies_version:{other}', 0),
            before,
            'a policy write in one tenant moved another tenant\'s cache version, '
            'which throws away their cached decisions for no reason',
        )
