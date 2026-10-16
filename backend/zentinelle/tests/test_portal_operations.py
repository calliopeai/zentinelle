"""The portal's own GraphQL documents, run against the real schema.

Two halves:

- Every operation in the frontend source is validated against the schema the
  server executes. Fifteen were rejected outright when this was written, nine
  of them on live pages, and nothing caught it, because the backend's tests ran
  the backend's own queries.
- The operations the risks, incidents, alerts, compliance, reports, retention,
  agents, content-rule, audit-log and API-key pages send are executed over
  HTTP with a portal session, with the variables shaped as each page sends
  them, against real rows in two tenants. Several of these passed validation
  and still failed in the resolver (raw UUIDs, a wrapper passing three
  arguments to a two-argument resolver, a tenant looked up on
  `user.memberships`, which a portal user does not have).

The documents are read from frontend/, not copied, so a page edit that breaks
the contract fails here too.
"""
import re
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from graphql import OperationDefinitionNode, parse, validate
from rest_framework.test import APIClient

from zentinelle.auth.roles import ROLE_ADMIN, ROLE_OPERATOR, assign_role
from zentinelle.models import (AgentEndpoint, ComplianceAlert,
                               ComplianceAssessment, ComplianceFrameworkConfig,
                               ContentRule, Incident, Policy, RetentionPolicy,
                               Risk, SystemPrompt)
from zentinelle.schema import schema

FRONTEND = Path(__file__).resolve().parents[3] / 'frontend'

# The tenant a portal session resolves to in standalone mode, and another one.
TENANT = '00000000-0000-0000-0000-000000000001'
OTHER = '00000000-0000-0000-0000-0000000000b2'

# Invalid, but no page issues them. They go with the dead modules (audit L3)
# rather than being repaired here; the test fails if one starts validating, so
# this list can only shrink.
DEAD_OPERATIONS = {
    'TestSystemPrompt', 'RateSystemPrompt', 'TogglePromptFavorite',
}

_GQL = re.compile(r'gql`(.*?)`', re.S)
_FIELDS = re.compile(r'const\s+([A-Z][A-Z0-9_]*)\s*=\s*`(.*?)`', re.S)
_INTERPOLATION = re.compile(r'\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}')


def frontend_operations():
    """(file, operation name, source) for every gql document in the frontend.

    Interpolations are the shared field strings each file declares as a plain
    template constant, which is the only kind the frontend uses.
    """
    found = []
    for path in sorted(FRONTEND.rglob('*.ts*')):
        if {'node_modules', '.next'} & set(path.parts) or path.suffix not in ('.ts', '.tsx'):
            continue
        # Tests send nothing, and the frontend's own operation validator
        # (graphql/operations.test.ts, which names gql`...` in its comments)
        # skips them too.
        if path.name.endswith(('.test.ts', '.test.tsx')):
            continue
        text = path.read_text()
        if 'gql`' not in text:
            continue
        fields = dict(_FIELDS.findall(text))
        for body in _GQL.findall(text):
            source = _INTERPOLATION.sub(lambda m: fields[m.group(1)], body)
            for definition in parse(source).definitions:
                if isinstance(definition, OperationDefinitionNode):
                    found.append((str(path.relative_to(FRONTEND)), definition.name.value, source))
    return found


def operation(name):
    sources = {source for _, op, source in frontend_operations() if op == name}
    assert len(sources) == 1, f'{name}: expected one document in the frontend, found {len(sources)}'
    return sources.pop()


class FrontendDocumentsValidateTests(SimpleTestCase):

    def test_every_frontend_operation_validates_against_the_schema(self):
        operations = frontend_operations()
        # Guards the extraction itself: finding nothing would pass.
        self.assertGreater(len(operations), 90)
        for path, name, source in operations:
            errors = [e.message for e in validate(schema._schema, parse(source))]
            with self.subTest(operation=name, file=path):
                if name in DEAD_OPERATIONS:
                    self.assertTrue(errors, f'{name} validates now; drop it from DEAD_OPERATIONS')
                else:
                    self.assertEqual(errors, [])


def _endpoint(tenant_id, agent_id):
    _, key_hash, key_prefix = AgentEndpoint.generate_api_key()
    return AgentEndpoint.objects.create(
        tenant_id=tenant_id, agent_id=agent_id, name=agent_id,
        api_key_hash=key_hash, api_key_prefix=key_prefix,
        status=AgentEndpoint.Status.ACTIVE,
    )


@override_settings(AUTH_MODE='local')
class PortalPageOperationTests(TestCase):
    """Each page's operations, as the page sends them, on rows in two tenants."""

    def setUp(self):
        self.client = self.portal('page-operator', ROLE_OPERATOR)

    @staticmethod
    def portal(username, role):
        user = get_user_model().objects.create_user(username=username, password='test-only-pass')
        assign_role(user, role)
        client = APIClient()
        client.force_login(user)
        return client

    def run_op(self, op, client=None, /, **variables):
        body = {'query': operation(op), 'variables': variables, 'operationName': op}
        return (client or self.client).post('/gql/zentinelle/', body, format='json').json()

    def ok(self, op, client=None, /, **variables):
        result = self.run_op(op, client, **variables)
        self.assertNotIn('errors', result, f'{op}: {result}')
        return result['data']

    def refused(self, op, /, **variables):
        result = self.run_op(op, None, **variables)
        payload = next(iter((result.get('data') or {}).values()), None)
        self.assertTrue(result.get('errors') or (payload and payload.get('success') is False), f'{op}: {result}')

    def risk(self, tenant_id, **fields):
        return Risk.objects.create(tenant_id=tenant_id, name=fields.pop('name', 'Prompt leak'),
                                   description='d', **fields)

    def incident(self, tenant_id):
        return Incident.objects.create(tenant_id=tenant_id, title='Leak', description='d', occurred_at=timezone.now())

    # risks/edit-risk-dialog.tsx, risks/[id]/page.tsx, risks/page.tsx

    def test_risk_pages(self):
        risk, theirs = self.risk(TENANT), self.risk(OTHER, name='Theirs')

        # The edit dialog: no input.id, the risk named by the top-level id.
        data = self.ok('UpdateRisk', id=str(risk.id), input={
            'name': 'Renamed', 'description': 'd2', 'category': 'security', 'status': 'assessed',
            'likelihood': 4, 'impact': 2, 'mitigationPlan': None, 'tags': None,
        })['updateRisk']
        self.assertEqual((data['success'], data['riskId']), (True, str(risk.id)), data)
        risk.refresh_from_db()
        self.assertEqual((risk.name, risk.status, risk.likelihood), ('Renamed', 'assessed', 4))

        # The detail page's status buttons.
        self.assertTrue(self.ok('UpdateRisk', id=str(risk.id), input={'status': 'mitigating'})['updateRisk']['success'])
        risk.refresh_from_db()
        self.assertEqual(risk.status, 'mitigating')

        self.assertTrue(self.ok('ReviewRisk', id=str(risk.id))['reviewRisk']['success'])
        risk.refresh_from_db()
        self.assertIsNotNone(risk.last_reviewed_at)

        self.refused('UpdateRisk', id=str(theirs.id), input={'name': 'Mine now'})
        self.refused('ReviewRisk', id=str(theirs.id))
        self.refused('DeleteRisk', id=str(theirs.id))
        theirs.refresh_from_db()
        self.assertEqual((theirs.name, theirs.last_reviewed_at), ('Theirs', None))

        self.assertTrue(self.ok('DeleteRisk', id=str(risk.id))['deleteRisk']['success'])
        self.assertFalse(Risk.objects.filter(pk=risk.pk).exists())

    def test_update_risk_refuses_a_conflicting_input_id(self):
        risk, other = self.risk(TENANT), self.risk(TENANT, name='Other')
        data = self.ok('UpdateRisk', id=str(risk.id), input={'id': str(other.id), 'name': 'x'})['updateRisk']
        self.assertFalse(data['success'], data)
        self.assertEqual(Risk.objects.filter(name='x').count(), 0)

    # incidents/page.tsx

    def test_incident_page(self):
        incident, theirs = self.incident(TENANT), self.incident(OTHER)

        self.assertTrue(self.ok('AcknowledgeIncident', id=str(incident.id))['acknowledgeIncident']['success'])
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.INVESTIGATING)

        self.assertTrue(self.ok('ResolveIncident', id=str(incident.id), resolution='Rotated the key')
                        ['resolveIncident']['success'])
        incident.refresh_from_db()
        self.assertEqual((incident.status, incident.resolution), (Incident.Status.RESOLVED, 'Rotated the key'))

        self.assertTrue(self.ok('CloseIncident', id=str(incident.id), lessonsLearned=None)['closeIncident']['success'])
        incident.refresh_from_db()
        self.assertEqual(incident.status, Incident.Status.CLOSED)

        for name, variables in (
            ('AcknowledgeIncident', {}),
            ('ResolveIncident', {'resolution': 'x'}),
            ('CloseIncident', {'lessonsLearned': None}),
            ('UpdateIncident', {'input': {'title': 'Mine now'}}),
        ):
            self.refused(name, id=str(theirs.id), **variables)
        theirs.refresh_from_db()
        self.assertEqual((theirs.status, theirs.title), (Incident.Status.OPEN, 'Leak'))

    def test_update_incident_takes_the_top_level_id(self):
        incident = self.incident(TENANT)
        data = self.ok('UpdateIncident', id=str(incident.id), input={'severity': 'high'})['updateIncident']
        self.assertTrue(data['success'], data)
        incident.refresh_from_db()
        self.assertEqual(incident.severity, 'high')

    # graphql/alerts (alerts page)

    def test_compliance_alert_actions(self):
        def alert(tenant_id):
            return ComplianceAlert.objects.create(tenant_id=tenant_id, alert_type='single_violation',
                                                  severity='high', title='Review', description='d')
        acked, resolved, dismissed, theirs = alert(TENANT), alert(TENANT), alert(TENANT), alert(OTHER)

        self.assertTrue(self.ok('AcknowledgeComplianceAlert', id=str(acked.id))['acknowledgeComplianceAlert']['success'])
        self.assertTrue(self.ok('ResolveComplianceAlert', id=str(resolved.id), notes='fixed')
                        ['resolveComplianceAlert']['success'])
        self.assertTrue(self.ok('DismissComplianceAlert', id=str(dismissed.id))['dismissComplianceAlert']['success'])
        for row, status in ((acked, 'acknowledged'), (resolved, 'resolved'), (dismissed, 'false_positive')):
            row.refresh_from_db()
            self.assertEqual(row.status, status)
        resolved.refresh_from_db()
        self.assertEqual(resolved.resolution_notes, 'fixed')

        for name in ('AcknowledgeComplianceAlert', 'ResolveComplianceAlert', 'DismissComplianceAlert'):
            self.refused(name, id=str(theirs.id))
        theirs.refresh_from_db()
        self.assertEqual(theirs.status, ComplianceAlert.Status.OPEN)

    # compliance/page.tsx, compliance/reports/page.tsx

    def test_compliance_page(self):
        data = self.ok('RunComplianceCheck')['runComplianceCheck']
        self.assertTrue(data['success'], data)
        self.assertTrue(ComplianceAssessment.objects.filter(pk=data['assessmentId'], tenant_id=TENANT).exists())

        self.ok('ToggleFramework', frameworkId='soc2', enabled=False)
        self.assertFalse(ComplianceFrameworkConfig.objects.get(tenant_id=TENANT, framework_id='soc2').is_enabled)
        self.ok('ToggleFramework', frameworkId='soc2', enabled=True)
        self.assertTrue(ComplianceFrameworkConfig.objects.get(tenant_id=TENANT, framework_id='soc2').is_enabled)

        data = self.ok('ActivateCompliancePack', packId='soc2')['activateCompliancePack']
        self.assertTrue(data['success'], data)
        self.assertGreater(data['policiesCreated'], 0)
        self.assertEqual(Policy.objects.filter(tenant_id=TENANT).count(), data['policiesCreated'])
        self.assertFalse(Policy.objects.exclude(tenant_id=TENANT).exists())

        data = self.ok('GenerateComplianceReport', frameworkId='soc2', startDate='2026-01-01', endDate=None)
        self.assertTrue(data['generateComplianceReport']['success'], data)
        self.assertIn('start=2026-01-01', data['generateComplianceReport']['reportUrl'])
        # A full report: the page sends every argument, as null.
        data = self.ok('GenerateComplianceReport', frameworkId=None, startDate=None, endDate=None)
        self.assertTrue(data['generateComplianceReport']['success'], data)

    # retention/page.tsx

    def test_retention_toggle(self):
        policy = RetentionPolicy.objects.create(tenant_id=TENANT, name='Events', entity_type='events', retention_days=30)
        theirs = RetentionPolicy.objects.create(tenant_id=OTHER, name='Theirs', entity_type='events', retention_days=30)

        self.assertTrue(self.ok('ToggleRetentionPolicyEnabled', id=str(policy.id), enabled=not policy.enabled)
                        ['toggleRetentionPolicyEnabled']['success'])
        policy.refresh_from_db()
        self.assertFalse(policy.enabled)

        self.refused('ToggleRetentionPolicyEnabled', id=str(theirs.id), enabled=False)
        theirs.refresh_from_db()
        self.assertTrue(theirs.enabled)

    # agents/page.tsx

    def test_regenerate_agent_key(self):
        mine, theirs = _endpoint(TENANT, 'mine'), _endpoint(OTHER, 'theirs')
        before = (mine.api_key_hash, theirs.api_key_hash)

        data = self.ok('RegenerateEndpointApiKey', id=str(mine.id))['regenerateEndpointApiKey']
        self.assertTrue(data['success'] and data['apiKey'], data)
        mine.refresh_from_db()
        self.assertNotEqual(mine.api_key_hash, before[0])

        self.refused('RegenerateEndpointApiKey', id=str(theirs.id))
        theirs.refresh_from_db()
        self.assertEqual(theirs.api_key_hash, before[1])

    # system-prompts/builder/page.tsx, opened by the prompt list's Edit

    def test_prompt_builder_saves_an_edit_in_place(self):
        operator = get_user_model().objects.get(username='page-operator')
        mine = SystemPrompt.objects.create(
            tenant_id=TENANT, user_id=str(operator.pk), name='Code review', slug='code-review',
            prompt_text='Review pull requests for tests.', visibility='organization',
        )

        loaded = self.ok('GetSystemPrompt', id=str(mine.id))['systemPrompt']
        self.assertEqual(loaded['promptText'], 'Review pull requests for tests.')

        saved = self.ok('UpdateSystemPrompt', id=str(mine.id), input={
            'name': 'Code review', 'promptText': 'Review pull requests for tests and security.',
        })['updateSystemPrompt']
        self.assertTrue(saved['success'], saved)
        self.assertEqual(saved['prompt']['id'], str(mine.id))
        mine.refresh_from_db()
        self.assertEqual(mine.prompt_text, 'Review pull requests for tests and security.')
        self.assertEqual(SystemPrompt.objects.count(), 1, 'the edit created a prompt')

        theirs = SystemPrompt.objects.create(
            tenant_id=TENANT, user_id='someone-else', name='Theirs', slug='theirs',
            prompt_text='Someone else wrote this prompt.', visibility='organization',
        )
        self.refused('UpdateSystemPrompt', id=str(theirs.id), input={
            'name': 'Theirs', 'promptText': 'Rewritten by another user.',
        })
        theirs.refresh_from_db()
        self.assertEqual(theirs.prompt_text, 'Someone else wrote this prompt.')

    # system-prompts/create/page.tsx, and the prompt list's Fork

    def test_a_prompt_created_or_forked_in_the_portal_is_in_its_tenant(self):
        created = self.ok('CreateSystemPrompt', input={
            'name': 'Release notes', 'description': None, 'promptText': 'Write release notes for this change.',
            'promptType': 'system', 'visibility': 'organization', 'compatibleProviders': None,
            'recommendedTemperature': None,
        })['createSystemPrompt']
        self.assertEqual(created['errors'], [])
        library = SystemPrompt.objects.create(
            name='Code reviewer', slug='code-reviewer', prompt_text='Review the change for tests.',
            status='active', visibility='public',
        )
        forked = self.ok('ForkSystemPrompt', id=str(library.id))['forkSystemPrompt']
        self.assertTrue(forked['success'], forked)
        prompts = SystemPrompt.objects.filter(id__in=[created['prompt']['id'], forked['prompt']['id']])
        self.assertEqual(sorted(prompts.values_list('name', 'tenant_id')),
                         [('Code reviewer (Fork)', TENANT), ('Release notes', TENANT)])

        # Each was missing from the list, null by id, and not found by the
        # builder's save.
        listed = {p['id'] for p in self.ok('GetSystemPrompts')['systemPrompts']}
        for prompt in prompts:
            self.assertIn(str(prompt.id), listed)
            self.assertEqual(self.ok('GetSystemPrompt', id=str(prompt.id))['systemPrompt']['id'], str(prompt.id))
            saved = self.ok('UpdateSystemPrompt', id=str(prompt.id), input={
                'name': prompt.name, 'promptText': 'Edited in the builder after saving.',
            })['updateSystemPrompt']
            self.assertTrue(saved['success'], saved)

        theirs = SystemPrompt.objects.create(
            tenant_id=OTHER, name='Theirs', slug='theirs', prompt_text='Another tenant wrote this prompt.',
            status='active', visibility='organization',
        )
        self.refused('ForkSystemPrompt', id=str(theirs.id))
        self.assertFalse(theirs.derived_prompts.exists())

    # content-rules/create-content-rule-dialog.tsx

    def test_testing_a_rule_runs_the_scanner_on_seeded_object_patterns(self):
        # As seed_demo writes them: patterns are objects, not strings.
        secrets = ContentRule.objects.create(
            tenant_id=TENANT, name='Block AWS Keys', rule_type='secret_detection', severity='critical',
            config={'patterns': [{'name': 'aws_access_key', 'regex': 'AKIA[0-9A-Z]{16}'}]},
        )
        custom = ContentRule.objects.create(
            tenant_id=TENANT, name='Tickets', rule_type='custom_pattern',
            config={'patterns': [{'name': 'ticket', 'regex': r'PROJ-\d+'}]},
        )

        data = self.ok('TestContentRule', id=str(secrets.id), content='key AKIAABCDEFGHIJKLMNOP here')['testContentRule']
        self.assertEqual((data['success'], data['matched']), (True, True), data)
        self.assertIn('aws_access_key', {m['category'] for m in data['matches']})

        data = self.ok('TestContentRule', id=str(custom.id), content='see PROJ-12')['testContentRule']
        self.assertEqual((data['success'], data['matched']), (True, True), data)
        self.assertEqual(data['matches'][0]['match'], 'PROJ-12')

    # audit-logs page (graphql/events/hooks.ts)

    def test_audit_analytics(self):
        data = self.ok('GetAuditAnalytics', days=7)
        self.assertIsNotNone(data['auditAnalytics'])

        from zentinelle.services import clickhouse_service
        with mock.patch.object(clickhouse_service, 'is_enabled', return_value=True), \
                mock.patch.object(clickhouse_service, 'event_timeline', return_value=[]) as timeline, \
                mock.patch.object(clickhouse_service, 'event_counts_by_type', return_value=[]), \
                mock.patch.object(clickhouse_service, 'top_agents_by_event_count', return_value=[]):
            data = self.ok('GetAuditAnalytics', days=7)
        self.assertIsNotNone(data['auditAnalytics'])
        self.assertEqual(timeline.call_args.kwargs['organization_id'], TENANT)

    # settings/api-keys/page.tsx

    def test_api_keys_page(self):
        admin = self.portal('page-admin', ROLE_ADMIN)
        data = self.ok('CreatePlatformAPIKey', admin, name='ci', scopes=['read'])['createPlatformApiKey']
        self.assertTrue(data['ok'], data)
        keys = self.ok('ApiKeys', admin)['apiKeys']
        # The wrapper used to hand `scopes` to `description`, so every key got read+write.
        self.assertEqual([(k['name'], k['scopes']) for k in keys], [('ci', ['read'])])
