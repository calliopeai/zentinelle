from django.test import SimpleTestCase
import json
from pathlib import Path

from zentinelle.services.agent_taxonomy import compose_taxonomy, inherit_taxonomy, validate_taxonomy


class AgentTaxonomyTests(SimpleTestCase):
    def test_browser_contract_fixture_matches_normalization(self):
        fixture = json.loads((Path(__file__).parents[3] / 'tests/contracts/agent-taxonomy-browser.json').read_text())
        result = validate_taxonomy(fixture['registration']['taxonomy'])
        self.assertEqual(result, fixture['expected'])
    def test_composes_dimensions_and_preserves_unsupported_values(self):
        result = validate_taxonomy([
            'function:customer_service', 'data:regulated', 'project:acme',
        ])
        self.assertEqual(result['supported'], ['data:regulated', 'function:customer_service'])
        self.assertEqual(result['unsupported'], ['project:acme'])

    def test_tenant_extension_can_authorize_owned_label(self):
        result = validate_taxonomy(['project:acme'], tenant_extensions={'project:acme'})
        self.assertEqual(result['supported'], ['project:acme'])
        self.assertEqual(result['unsupported'], [])

    def test_child_cannot_widen_parent_authority(self):
        parent = validate_taxonomy(['authority:read_only'])
        child = validate_taxonomy(['authority:destructive'])
        with self.assertRaisesRegex(ValueError, 'widen'):
            inherit_taxonomy(parent, child)

    def test_undeclared_parent_authority_defaults_to_read_only(self):
        with self.assertRaisesRegex(ValueError, 'widen'):
            inherit_taxonomy(validate_taxonomy(['function:legal']),
                             validate_taxonomy(['authority:write']))

    def test_composes_multiple_scopes_and_preserves_unsupported_tags(self):
        result = compose_taxonomy(
            validate_taxonomy(['function:customer_service', 'project:acme']),
            validate_taxonomy(['service:legal', 'workspace:claims']),
            validate_taxonomy(['mode:workflow']),
        )
        self.assertEqual(result['supported'], ['function:customer_service', 'mode:workflow', 'service:legal'])
        self.assertEqual(result['unsupported'], ['project:acme', 'workspace:claims'])
