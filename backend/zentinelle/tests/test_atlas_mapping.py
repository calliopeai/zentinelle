import json
from pathlib import Path

from django.test import SimpleTestCase


class AtlasMappingTests(SimpleTestCase):
    def test_guardrail_mapping_uses_verified_current_technique_ids(self):
        path = Path(__file__).resolve().parents[3] / 'docs' / 'atlas-guardrails.json'
        mapping = json.loads(path.read_text(encoding='utf-8'))
        techniques = {item['name']: item['id'] for item in mapping['techniques']}
        self.assertEqual(techniques['AI Agent Tool Invocation'], 'AML.T0053')
        self.assertEqual(techniques['AI Agent Context Poisoning'], 'AML.T0080')
        self.assertEqual(techniques['Exfiltration via AI Agent Tool Invocation'], 'AML.T0086')
        self.assertEqual(techniques['Modify AI Agent Configuration'], 'AML.T0081')
        self.assertNotIn(None, techniques.values())
