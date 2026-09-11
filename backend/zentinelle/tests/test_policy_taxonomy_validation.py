from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from zentinelle.models import Policy


class PolicyTaxonomyValidationTests(SimpleTestCase):
    def test_selector_requires_dimension_value_syntax(self):
        policy = Policy(config={'taxonomy_selectors': ['customer_service']})
        with self.assertRaises(ValidationError):
            policy.clean()

    def test_multiple_composable_selectors_are_valid(self):
        policy = Policy(config={'taxonomy_selectors': ['function:legal', 'data:regulated']})
        policy.clean()
