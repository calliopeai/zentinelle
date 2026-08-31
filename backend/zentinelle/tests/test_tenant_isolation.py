"""One tenant cannot reach another tenant's rows (#217).

Every case here failed before the fix, and each one is a resolver or view that
took an id straight off the wire and constrained it by nothing but that id. A
UUID is unguessable; unguessable is not a permission, and several of these ids
are not even unguessable — a prompt is fetched by `slug`, which is chosen.

The root of it was `schema/auth_helpers.user_has_org_access(user, org_id)`,
which accepted `org_id` and never read it: it answered True for any
authenticated viewer, and about twenty resolvers used it as their only tenant
boundary.

The severest single case is `regenerate_endpoint_api_key`, which returns the
plaintext key it writes. Given another tenant's endpoint id it handed back a
working `sk_agent_` credential for that tenant, which then authenticates
against every agent REST route and the LLM proxy — a full takeover from one
identifier.

Two tenants, one caller belonging to the first, every assertion about the
second's data.
"""
import uuid

from django.test import RequestFactory, TestCase

from zentinelle.api.auth import ZentinelleAgentUser
from zentinelle.models import AgentEndpoint, Policy, SystemPrompt
from zentinelle.schema.auth_helpers import user_has_org_access
from zentinelle.schema.mutations import endpoint as endpoint_mutations
from zentinelle.schema.mutations import policy as policy_mutations

TENANT_A = "00000000-0000-0000-0000-00000000000a"
TENANT_B = "00000000-0000-0000-0000-00000000000b"


class _Info:
    """The one attribute the resolvers touch: `info.context.request.user`."""

    def __init__(self, user):
        request = RequestFactory().post("/graphql")
        request.user = user
        self.context = type("Ctx", (), {"request": request})()


def _endpoint(tenant_id, agent_id):
    _, key_hash, key_prefix = AgentEndpoint.generate_api_key()
    return AgentEndpoint.objects.create(
        tenant_id=tenant_id,
        agent_id=agent_id,
        name=agent_id,
        api_key_hash=key_hash,
        api_key_prefix=key_prefix,
        status=AgentEndpoint.Status.ACTIVE,
    )


class TenantIsolationTest(TestCase):
    def setUp(self):
        self.mine = _endpoint(TENANT_A, "mine")
        self.theirs = _endpoint(TENANT_B, "theirs")
        self.caller = ZentinelleAgentUser(self.mine)
        self.info = _Info(self.caller)

        self.their_policy = Policy.objects.create(
            tenant_id=TENANT_B,
            name="Their blocking policy",
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enabled=True,
            config={"max_requests": 1, "window_seconds": 60},
        )

    # ---- the helper every leaking resolver leaned on --------------------

    def test_user_has_org_access_reads_the_tenant_it_is_given(self):
        self.assertTrue(user_has_org_access(self.caller, TENANT_A))
        self.assertFalse(
            user_has_org_access(self.caller, TENANT_B),
            "user_has_org_access answered True for another tenant, which is what "
            "made every resolver that calls it a cross-tenant hole",
        )

    # ---- the takeover ---------------------------------------------------

    def test_an_api_key_cannot_be_minted_for_another_tenants_endpoint(self):
        before = self.theirs.api_key_hash
        result = endpoint_mutations.regenerate_endpoint_api_key(
            self.info, str(self.theirs.id)
        )
        self.assertFalse(
            getattr(result, "success", False),
            "a caller in one tenant was issued a working API key for another "
            "tenant's endpoint",
        )
        self.assertIsNone(getattr(result, "api_key", None))
        self.theirs.refresh_from_db()
        self.assertEqual(
            self.theirs.api_key_hash, before, "the other tenant's key was rotated"
        )

    def test_another_tenants_endpoint_cannot_be_deleted(self):
        result = endpoint_mutations.delete_agent_endpoint(self.info, str(self.theirs.id))
        self.assertFalse(getattr(result, "success", False))
        self.assertTrue(AgentEndpoint.objects.filter(id=self.theirs.id).exists())

    def test_another_tenants_endpoint_cannot_be_renamed(self):
        result = endpoint_mutations.update_endpoint_status(
            self.info, str(self.theirs.id), AgentEndpoint.Status.SUSPENDED
        )
        self.assertFalse(getattr(result, "success", False))
        self.theirs.refresh_from_db()
        self.assertEqual(self.theirs.status, AgentEndpoint.Status.ACTIVE)

    # ---- policies: reading, copying, and disabling -----------------------

    def test_another_tenants_policy_cannot_be_toggled_off(self):
        result = policy_mutations.toggle_policy_enabled(self.info, str(self.their_policy.id))
        self.assertFalse(
            getattr(result, "success", False),
            "a caller disabled another tenant's policy, which is the enforcement "
            "the product exists to apply",
        )
        self.their_policy.refresh_from_db()
        self.assertTrue(self.their_policy.enabled)

    def test_another_tenants_policy_cannot_be_deleted(self):
        result = policy_mutations.delete_policy(self.info, str(self.their_policy.id))
        self.assertFalse(getattr(result, "success", False))
        self.assertTrue(Policy.objects.filter(id=self.their_policy.id).exists())

    def test_another_tenants_policy_cannot_be_duplicated(self):
        result = policy_mutations.duplicate_policy(self.info, str(self.their_policy.id))
        self.assertFalse(
            getattr(result, "success", False),
            "duplicate_policy copied another tenant's whole config into a policy "
            "the caller then owns",
        )

    def test_a_policy_cannot_be_created_in_another_tenant(self):
        payload = policy_mutations.create_policy(
            self.info,
            uuid.UUID(TENANT_B),
            policy_mutations.CreatePolicyInput(
                name="Injected",
                policy_type=Policy.PolicyType.RATE_LIMIT,
                config={"max_requests": 1, "window_seconds": 60},
            ),
        )
        self.assertFalse(
            getattr(payload, "success", False),
            "the tenant a policy lands in was taken from a client argument, so a "
            "caller could install enforcement in somebody else's tenant",
        )
        self.assertFalse(Policy.objects.filter(tenant_id=TENANT_B, name="Injected").exists())

    # ---- prompts: the body is the secret --------------------------------

    def test_another_tenants_private_prompt_is_not_readable_by_id_or_slug(self):
        from zentinelle.schema.system_prompt import PromptLibraryQuery

        theirs = SystemPrompt.objects.create(
            tenant_id=TENANT_B,
            name="Their private prompt",
            slug="their-private-prompt",
            prompt_text="the part that is theirs",
            status="active",
            visibility=SystemPrompt.Visibility.PRIVATE,
        )
        query = PromptLibraryQuery()
        self.assertIsNone(
            query.system_prompt(self.info, id=theirs.id),
            "another tenant's private prompt was returned by id",
        )
        self.assertIsNone(
            query.system_prompt(self.info, slug=theirs.slug),
            "another tenant's private prompt was returned by slug, and a slug is "
            "chosen rather than random",
        )
