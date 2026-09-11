"""Keep the published SDK support matrix tied to real contract fixtures."""
import json
from pathlib import Path

from django.test import SimpleTestCase

REPO_ROOT = Path(__file__).resolve().parents[3]
MATRIX_PATH = REPO_ROOT / 'docs' / 'sdk-support-matrix.json'


class SDKSupportMatrixTests(SimpleTestCase):
    def test_matrix_references_existing_contract_fixtures_and_implementations(self):
        matrix = json.loads(MATRIX_PATH.read_text())
        self.assertEqual(matrix['contract_version'], '1')
        self.assertTrue(matrix['generated_at'])
        self.assertTrue(matrix['sdk_repository_revision'])

        for name, fixture in matrix['fixtures'].items():
            with self.subTest(fixture=name):
                self.assertTrue((REPO_ROOT / fixture).exists(), fixture)

        allowed_statuses = {'contract-tested', 'sdk-contract-tested', 'gateway-contract-tested', 'browser-contract-tested'}
        for implementation in matrix['implementations']:
            with self.subTest(implementation=implementation['name']):
                self.assertIn(implementation['status'], allowed_statuses)
                prefix = 'sdk' if implementation['name'] not in {'gateway', 'browser'} else ''
                path = REPO_ROOT / prefix / implementation['path']
                self.assertTrue(path.exists(), implementation['path'])
                self.assertTrue(implementation.get('limitations'))
