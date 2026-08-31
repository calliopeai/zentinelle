"""Content rules and compliance alerts are tenant-scoped (#283).

These eight resolvers looked guarded — each fetched by primary key and then
called `user_has_org_access` — but the guard read `instance.organization_id`,
an attribute neither model has since the FK was replaced by `tenant_id`. The
read raised AttributeError outside the try block, so they answered 500 rather
than leaking, and the leak was one attribute-rename away: repairing the name
without also repairing `user_has_org_access` (#217) would have turned all
eight into working cross-tenant writes.

Both halves are fixed, so these assert the behaviour rather than the accident:
a caller in one tenant cannot act on the other's rows, and a caller in the
right tenant still can.
"""
from django.test import RequestFactory, TestCase
from graphql import GraphQLError
from graphql_relay import to_global_id

from zentinelle.api.auth import ZentinelleAgentUser
from zentinelle.models import AgentEndpoint, ContentRule
from zentinelle.schema.mutations import content_rules as content_rule_mutations

TENANT_A = '00000000-0000-0000-0000-0000000000a1'
TENANT_B = '00000000-0000-0000-0000-0000000000b1'


class _Info:
    def __init__(self, user):
        request = RequestFactory().post('/graphql')
        request.user = user
        self.context = type('Ctx', (), {'request': request})()


def _gid(rule):
    """The Relay global id the mutations decode. A bare UUID is not one, and
    passing one lands in `ContentRule.objects.get(pk='')`."""
    return to_global_id('ContentRuleType', str(rule.id))


def _endpoint(tenant_id, agent_id):
    _, key_hash, key_prefix = AgentEndpoint.generate_api_key()
    return AgentEndpoint.objects.create(
        tenant_id=tenant_id, agent_id=agent_id, name=agent_id,
        api_key_hash=key_hash, api_key_prefix=key_prefix,
        status=AgentEndpoint.Status.ACTIVE,
    )


class ContentRuleTenancyTest(TestCase):
    def setUp(self):
        self.caller = ZentinelleAgentUser(_endpoint(TENANT_A, 'mine'))
        self.info = _Info(self.caller)
        self.mine = ContentRule.objects.create(
            tenant_id=TENANT_A, name='Mine', rule_type='secrets', enabled=True,
        )
        self.theirs = ContentRule.objects.create(
            tenant_id=TENANT_B, name='Theirs', rule_type='secrets', enabled=True,
        )

    def test_another_tenants_rule_cannot_be_deleted(self):
        with self.assertRaises(GraphQLError):
            content_rule_mutations.delete_content_rule(self.info, _gid(self.theirs))
        self.assertTrue(
            ContentRule.objects.filter(pk=self.theirs.pk).exists(),
            "another tenant's content rule was deleted",
        )

    def test_another_tenants_rule_cannot_be_disabled(self):
        with self.assertRaises(GraphQLError):
            content_rule_mutations.toggle_content_rule_enabled(
                self.info, _gid(self.theirs), False
            )
        self.theirs.refresh_from_db()
        self.assertTrue(
            self.theirs.enabled,
            "another tenant's detection rule was switched off, which is the "
            "control this product exists to apply",
        )

    def test_my_own_rule_is_still_reachable(self):
        """The guard must refuse the neighbour without refusing the owner.

        Worth asserting explicitly: before this, the attribute read raised for
        *everyone*, so 'it refuses' was true for the wrong reason and a fix
        that kept refusing would have looked correct.
        """
        result = content_rule_mutations.toggle_content_rule_enabled(
            self.info, _gid(self.mine), False
        )
        self.assertTrue(getattr(result, 'success', False), getattr(result, 'errors', None))
        self.mine.refresh_from_db()
        self.assertFalse(self.mine.enabled)
