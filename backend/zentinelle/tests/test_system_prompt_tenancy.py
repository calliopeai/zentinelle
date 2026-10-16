"""A prompt belongs to the tenant that created or forked it (#454).

Create and fork saved `tenant_id=''`, so the prompt was in no tenant's library:
missing from the list, null by id, and "Prompt not found" to the update that
the builder sends next. The callers here are the two agents of the shared
two-tenant fixture, so a resolver that put every prompt in the portal's tenant
would fail as surely as one that put it in none. They call the resolvers
directly, as test_tenant_isolation does: the schema's role gate admits portal
identities only, and every one of those resolves to the portal's tenant. The
portal's own documents run the same path over HTTP in test_portal_operations.
"""
from types import SimpleNamespace

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import RequestFactory, TestCase, TransactionTestCase

from zentinelle.api.auth import ZentinelleAgentUser
from zentinelle.models import PromptCategory, PromptFavorite, SystemPrompt
from zentinelle.schema import Query, schema
from zentinelle.schema.system_prompt import (CreateSystemPromptInput,
                                             UpdateSystemPromptInput,
                                             create_system_prompt,
                                             delete_system_prompt,
                                             fork_system_prompt,
                                             rate_system_prompt,
                                             toggle_prompt_favorite,
                                             update_system_prompt)
from zentinelle.tests._graphql_helpers import STANDALONE_TENANT, admin_context
from zentinelle.tests._two_tenants import TENANT_A, TENANT_B, TwoTenantMixin


class _Info:
    """What the resolvers read: `info.context.request.user`."""

    def __init__(self, user):
        request = RequestFactory().post('/gql/zentinelle/')
        request.user = user
        self.context = SimpleNamespace(request=request)


def _ids(prompts):
    return {str(prompt.id) for prompt in prompts}


class PromptTenancyTests(TwoTenantMixin, TestCase):

    def setUp(self):
        super().setUp()
        self.a = _Info(ZentinelleAgentUser(self.endpoint_a))
        self.b = _Info(ZentinelleAgentUser(self.endpoint_b))
        # As seed_prompt_library writes it: no tenant, no creator, published.
        self.library = SystemPrompt.objects.create(
            name='Code reviewer', slug='code-reviewer', prompt_text='Review the change for tests and security.',
            status='active', visibility='public')

    def create(self, info, **fields):
        fields.setdefault('name', 'Release notes')
        fields.setdefault('prompt_text', 'Write release notes for this change.')
        payload = create_system_prompt(info, CreateSystemPromptInput(**fields))
        self.assertTrue(payload.success, payload.errors)
        return SystemPrompt.objects.get(id=payload.prompt.id)

    def fork(self, info, prompt):
        payload = fork_system_prompt(info, prompt.id)
        self.assertTrue(payload.success, payload.errors)
        return SystemPrompt.objects.get(id=payload.prompt.id)

    def publish(self, info, prompt):
        payload = update_system_prompt(info, prompt.id, UpdateSystemPromptInput(status='active'))
        self.assertTrue(payload.success, payload.errors)

    @staticmethod
    def listed(info):
        return _ids(Query().system_prompts(info))

    @staticmethod
    def opened(info, prompt):
        return Query().system_prompt(info, id=prompt.id)

    def test_a_created_prompt_is_in_the_creating_tenant(self):
        prompt = self.create(self.a)
        self.assertEqual((prompt.tenant_id, prompt.user_id), (TENANT_A, str(self.endpoint_a.pk)))
        self.assertIn(str(prompt.id), self.listed(self.a))
        self.assertEqual(self.opened(self.a, prompt), prompt)
        self.assertIn(str(prompt.id), _ids(Query().my_prompts(self.a)))
        edited = update_system_prompt(self.a, prompt.id, UpdateSystemPromptInput(name='Release notes v2'))
        self.assertTrue(edited.success, edited.errors)

        self.assertNotIn(str(prompt.id), self.listed(self.b))
        self.assertIsNone(self.opened(self.b, prompt))

    def test_slugs_are_free_per_tenant(self):
        # Checked across every tenant, a second tenant's slug told it the first
        # had a prompt of that name.
        self.assertEqual([self.create(info).slug for info in (self.a, self.b, self.a)],
                         ['release-notes', 'release-notes', 'release-notes-1'])

    def test_a_fork_is_in_the_forking_tenant(self):
        fork = self.fork(self.a, self.library)
        self.assertEqual((fork.tenant_id, fork.user_id, fork.parent_prompt_id),
                         (TENANT_A, str(self.endpoint_a.pk), self.library.id))
        self.assertEqual((fork.status, fork.visibility), ('draft', 'private'))
        self.assertIn(str(fork.id), self.listed(self.a))
        self.assertEqual(self.opened(self.a, fork), fork)

        self.assertNotIn(str(fork.id), self.listed(self.b))
        self.assertIsNone(self.opened(self.b, fork))

    def test_a_prompt_can_be_forked_more_than_once(self):
        # Every fork was ('', '<slug>-fork', 1), so the second one broke the
        # unique constraint.
        for info in (self.a, self.a, self.b):
            self.fork(info, self.library)
        self.assertEqual(sorted(self.library.derived_prompts.values_list('tenant_id', 'slug')), [
            (TENANT_A, 'code-reviewer-fork'), (TENANT_A, 'code-reviewer-fork-1'), (TENANT_B, 'code-reviewer-fork')])
        self.library.refresh_from_db()
        self.assertEqual(self.library.fork_count, 3)

    def test_another_tenants_prompts_are_refused(self):
        private = self.create(self.a, name='Private', visibility='private')
        team = self.create(self.a, name='Team', visibility='organization')
        # Create saves a draft: public, but not published.
        unpublished = self.create(self.a, name='Unpublished', visibility='public')
        for prompt in (private, team, unpublished):
            with self.subTest(prompt=prompt.name):
                self.assertNotIn(str(prompt.id), self.listed(self.b))
                self.assertIsNone(self.opened(self.b, prompt))
                self.assertEqual(fork_system_prompt(self.b, prompt.id).errors, ['Prompt not found'])
                self.assertEqual(update_system_prompt(self.b, prompt.id, UpdateSystemPromptInput(
                    prompt_text='Rewritten by another tenant.')).errors, ['Prompt not found'])
                self.assertEqual(delete_system_prompt(self.b, prompt.id).errors, ['Prompt not found'])
                self.assertFalse(toggle_prompt_favorite(self.b, prompt.id).success)
                self.assertEqual(rate_system_prompt(self.b, prompt.id, 5).errors, ['Prompt not found'])

        self.assertFalse(SystemPrompt.objects.filter(tenant_id=TENANT_B).exists())
        self.assertEqual(sorted(SystemPrompt.objects.filter(tenant_id=TENANT_A).values_list(
            'name', 'prompt_text', 'fork_count', 'favorite_count', 'avg_rating')), [
            (name, 'Write release notes for this change.', 0, 0, None)
            for name in ('Private', 'Team', 'Unpublished')])

    def test_a_published_prompt_is_forked_into_the_forking_tenant(self):
        prompt = self.create(self.a, visibility='public')
        self.publish(self.a, prompt)
        self.assertIn(str(prompt.id), self.listed(self.b))
        fork = self.fork(self.b, prompt)
        self.assertEqual((fork.tenant_id, fork.parent_prompt_id), (TENANT_B, prompt.id))
        self.assertNotIn(str(fork.id), self.listed(self.a))

    def test_a_prompt_with_no_tenant_is_seen_by_no_tenant(self):
        # As the old create and fork saved them, and as migration 0070 leaves
        # the ones whose creator it cannot place in one tenant.
        lost = [
            SystemPrompt.objects.create(user_id=str(self.endpoint_a.pk), name=name, slug=name.lower(),
                                        prompt_text='Saved with no tenant before #454.', visibility=visibility)
            for name, visibility in (('Private', 'private'), ('Team', 'organization'), ('Public', 'public'))
        ]
        # Favourited while the old rule still let a public draft be acted on.
        PromptFavorite.objects.create(ext_user_id=str(self.endpoint_a.pk), prompt=lost[2])

        for info in (self.a, self.b):
            self.assertEqual(self.listed(info) & _ids(lost), set())
            self.assertIn(str(self.library.id), self.listed(info))
            self.assertEqual(_ids(Query().my_prompts(info)) & _ids(lost), set())
            self.assertEqual(_ids(Query().my_favorites(info)) & _ids(lost), set())
            for prompt in lost:
                with self.subTest(prompt=prompt.name):
                    self.assertIsNone(self.opened(info, prompt))
                    self.assertEqual(fork_system_prompt(info, prompt.id).errors, ['Prompt not found'])
                    self.assertEqual(update_system_prompt(info, prompt.id, UpdateSystemPromptInput(
                        name='Found')).errors, ['Prompt not found'])
        self.assertEqual(SystemPrompt.objects.filter(tenant_id='').count(), 4)


class PromptReadsThroughTheSchemaTests(TestCase):
    """Fields that read further prompts, run through GraphQL as the portal."""

    COUNTS = '''{
      promptCategories { slug promptCount }
      promptCategory(slug: "engineering") { promptCount }
    }'''

    def setUp(self):
        self.category = PromptCategory.objects.create(name='Engineering', slug='engineering')

    def run_query(self, query, **variables):
        result = schema.execute_sync(query, variable_values=variables, context_value=admin_context())
        self.assertIsNone(result.errors, result.errors)
        return result.data

    def test_category_counts_leave_out_other_tenants_prompts(self):
        for name, tenant_id, visibility in (('Ours', STANDALONE_TENANT, 'organization'), ('Library', '', 'public'),
                                            ('Theirs', TENANT_B, 'organization')):
            SystemPrompt.objects.create(tenant_id=tenant_id, category=self.category, name=name, slug=name.lower(),
                                        prompt_text='Review this change.', status='active', visibility=visibility)
        data = self.run_query(self.COUNTS)
        self.assertEqual({c['slug']: c['promptCount'] for c in data['promptCategories']}['engineering'], 2)
        self.assertEqual(data['promptCategory']['promptCount'], 2)

    def test_a_forks_parent_is_shown_while_the_portal_may_see_it(self):
        parent = SystemPrompt.objects.create(tenant_id=TENANT_B, name='Their reviewer', slug='their-reviewer',
                                             prompt_text='Their reviewer prompt.', status='active', visibility='public')
        forked = self.run_query('mutation($id: ID!) { forkSystemPrompt(id: $id) { prompt { id } } }',
                                id=str(parent.id))['forkSystemPrompt']['prompt']
        edit = '''mutation($id: ID!) {
          updateSystemPrompt(id: $id, input: {name: "Mine now"}) { prompt { parentPrompt { id promptText } } }
        }'''
        shown = self.run_query(edit, id=forked['id'])['updateSystemPrompt']['prompt']['parentPrompt']
        self.assertEqual(shown, {'id': str(parent.id), 'promptText': 'Their reviewer prompt.'})

        SystemPrompt.objects.filter(pk=parent.pk).update(visibility='private')
        self.assertIsNone(self.run_query(edit, id=forked['id'])['updateSystemPrompt']['prompt']['parentPrompt'])


class TenantlessPromptBackfillTests(TransactionTestCase):
    """Migration 0070 on rows as the old create and fork left them, both ways."""

    before = ('zentinelle', '0069_seed_model_prices')
    after = ('zentinelle', '0070_assign_tenantless_prompts')

    def migrate(self, target):
        executor = MigrationExecutor(connection)
        executor.migrate([target] if target else executor.loader.graph.leaf_nodes())
        return executor.loader.project_state([target]).apps if target else None

    def snapshot(self):
        return dict(SystemPrompt.objects.values_list('name', 'tenant_id'))

    def test_creators_prompts_return_to_their_tenant(self):
        old = self.migrate(self.before).get_model('zentinelle', 'SystemPrompt').objects

        def prompt(name, slug, tenant_id='', user_id='', **fields):
            return old.create(name=name, slug=slug, tenant_id=tenant_id, user_id=user_id,
                              prompt_text='A prompt saved before #454.', **fields)

        library = prompt('Library', 'code-reviewer', status='active', visibility='public')
        prompt('Created', 'release-notes', user_id='7', visibility='private')
        prompt('Forked', 'code-reviewer-fork', user_id='7', visibility='private', parent_prompt=library)
        # Already in the portal tenant: still one tenant, and its slug is taken.
        prompt('Kept', 'triage', tenant_id=STANDALONE_TENANT, user_id='7')
        prompt('Clashing', 'triage', user_id='7')
        # This creator also has a prompt in another tenant: two tenants, no guess.
        prompt('Ambiguous', 'their-notes', user_id='8')
        prompt('Elsewhere', 'their-notes', tenant_id=TENANT_B, user_id='8')
        prompt('Nobody', 'no-creator')

        self.migrate(self.after)
        expected = {
            'Library': '', 'Created': STANDALONE_TENANT, 'Forked': STANDALONE_TENANT, 'Kept': STANDALONE_TENANT,
            'Clashing': STANDALONE_TENANT, 'Ambiguous': '', 'Elsewhere': TENANT_B, 'Nobody': '',
        }
        self.assertEqual(self.snapshot(), expected)
        self.assertEqual(dict(SystemPrompt.objects.filter(user_id='7').values_list('name', 'slug')), {
            'Created': 'release-notes', 'Forked': 'code-reviewer-fork', 'Kept': 'triage', 'Clashing': 'triage-1'})

        portal = Query().system_prompts(_Info(admin_context().request.user))
        self.assertEqual({p.name for p in portal}, {'Library', 'Created', 'Forked', 'Kept', 'Clashing'})

        # Reversing leaves them where they are; going forward again is a no-op.
        self.migrate(self.before)
        self.assertEqual(self.snapshot(), expected)
        self.migrate(None)
        self.assertEqual(self.snapshot(), expected)
