import json
from pathlib import Path

from django.test import SimpleTestCase


class FunctionalCapabilityMatrixTests(SimpleTestCase):
    def test_matrix_covers_all_managed_boundaries_with_evidence(self):
        root = Path(__file__).parents[3]
        matrix = json.loads((root / 'docs/functional-policy-capability-matrix.json').read_text())
        required = {'ingress', 'model', 'retrieval', 'tool', 'workflow', 'egress', 'operator'}
        self.assertEqual({item['id'] for item in matrix['boundaries']}, required)
        for item in matrix['boundaries']:
            self.assertTrue((root / item['evidence']).exists(), item['id'])
            self.assertTrue(item['actions'])
            self.assertTrue(item['resource'])
