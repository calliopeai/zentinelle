"""Executable checks for the supported Kubernetes enforcement profile."""
from pathlib import Path

import yaml
from django.test import SimpleTestCase

ROOT = Path(__file__).resolve().parents[3]


class DeploymentProfileTests(SimpleTestCase):
    def _documents(self, name):
        path = ROOT / 'deploy' / 'kubernetes' / name
        return list(yaml.safe_load_all(path.read_text()))

    def test_cilium_agent_profile_has_no_direct_provider_egress(self):
        docs = self._documents('network-policy-cilium.yaml')
        policy = docs[0]
        self.assertEqual(policy['kind'], 'CiliumNetworkPolicy')
        self.assertEqual(
            policy['spec']['endpointSelector']['matchLabels']['zentinelle.ai/governed'],
            'true',
        )
        rules = policy['spec']['egress']
        self.assertTrue(any(
            rule.get('toEndpoints', [{}])[0].get('matchLabels', {}).get(
                'app.kubernetes.io/name') == 'zentinelle-gateway'
            for rule in rules
        ))
        self.assertFalse(any('toFQDNs' in rule for rule in rules))

    def test_vanilla_agent_profile_is_default_deny_with_gateway_only(self):
        policy = self._documents('network-policy-vanilla.yaml')[0]
        self.assertEqual(policy['kind'], 'NetworkPolicy')
        self.assertEqual(policy['spec']['policyTypes'], ['Egress'])
        egress = policy['spec']['egress']
        self.assertEqual(len(egress), 2)
        self.assertTrue(any(
            item.get('to', [{}])[0].get('podSelector', {}).get('matchLabels', {}).get(
                'app.kubernetes.io/name') == 'zentinelle-gateway'
            for item in egress
        ))
