from django.test import SimpleTestCase

from zentinelle.services.agent_taxonomy import validate_taxonomy


class AgentTaxonomyTests(SimpleTestCase):
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
