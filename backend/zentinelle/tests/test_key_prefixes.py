"""Key lookup costs an unauthenticated caller nothing, and shared prefixes lock nobody out (T10)."""
import hashlib
import json
from unittest.mock import patch

import bcrypt
from django.test import Client, TestCase
from django.urls import reverse

from zentinelle.models import AgentEndpoint, APIKey
from zentinelle.tests._two_tenants_portal import TENANT_A
from zentinelle.utils.api_keys import KeyPrefixes, hash_api_key


def _agent(agent_id, key, prefix):
    return AgentEndpoint.objects.create(tenant_id=TENANT_A, agent_id=agent_id, name=agent_id,
                                        api_key_hash=hash_api_key(key), api_key_prefix=prefix)


def _evaluate(key):
    return Client().post('/api/zentinelle/v1/evaluate', data=json.dumps({'action': 'tool_call', 'context': {}}),
                         content_type='application/json', HTTP_X_ZENTINELLE_KEY=key)


class AgentKeyPrefixTests(TestCase):
    def test_a_new_key_keeps_16_random_characters_in_its_prefix(self):
        key, _, prefix = AgentEndpoint.generate_api_key()

        self.assertEqual(prefix, key[:len(KeyPrefixes.AGENT) + 16])

    def test_a_made_up_key_costs_no_bcrypt_check(self):
        keys = []
        for n in range(5):
            key, key_hash, prefix = AgentEndpoint.generate_api_key()
            AgentEndpoint.objects.create(tenant_id=TENANT_A, agent_id=f'a{n}', name='a',
                                         api_key_hash=key_hash, api_key_prefix=prefix)
            keys.append(key)
        # The same first three random characters as a live key, which used to
        # be all the stored prefix held.
        forged = keys[0][:12] + 'x' * 40

        with patch.object(bcrypt, 'checkpw', wraps=bcrypt.checkpw) as checks:
            self.assertEqual(_evaluate(forged).status_code, 401)

        self.assertEqual(checks.call_count, 0)
        self.assertEqual(_evaluate(keys[0]).status_code, 200)

    def test_a_key_minted_before_still_authenticates(self):
        key = KeyPrefixes.AGENT + 'legacykeyrandompart0123456789'
        _agent('legacy', key, key[:12])

        self.assertEqual(_evaluate(key).status_code, 200)

    def test_an_unsalted_sha256_hash_is_refused(self):
        key = KeyPrefixes.AGENT + 'shakeyrandompart0123456789abcdef'
        AgentEndpoint.objects.create(tenant_id=TENANT_A, agent_id='sha', name='sha', api_key_prefix=key[:12],
                                     api_key_hash=hashlib.sha256(key.encode()).hexdigest())

        self.assertEqual(_evaluate(key).status_code, 401)


class PlatformKeyPrefixTests(TestCase):
    def test_two_keys_sharing_a_prefix_both_work(self):
        shared = KeyPrefixes.PLATFORM + 'abc'
        keys = [shared + 'first-random-part-0123456789', shared + 'second-random-part-012345678']
        for key in keys:
            APIKey.objects.create(tenant_id=TENANT_A, name=key[-6:], key_prefix=key[:15],
                                  key_hash=hash_api_key(key), scopes=['read'])

        for key in keys:
            with self.subTest(key=key[-6:]):
                response = Client().get(reverse('zentinelle:operator-agents'), HTTP_AUTHORIZATION=f'Bearer {key}')
                self.assertEqual(response.status_code, 200, response.content)

    def test_a_new_key_keeps_16_random_characters_in_its_prefix(self):
        for key_type, type_prefix in ((APIKey.KeyType.USER, KeyPrefixes.PLATFORM),
                                      (APIKey.KeyType.SERVICE, KeyPrefixes.SERVICE)):
            with self.subTest(key_type=key_type):
                key, key_hash, prefix = APIKey.generate_api_key(key_type)
                self.assertEqual(prefix, key[:len(type_prefix) + 16])
                APIKey.objects.create(tenant_id=TENANT_A, name=str(key_type), key_prefix=prefix,
                                      key_hash=key_hash, scopes=['read'], key_type=key_type)
                response = Client().get(reverse('zentinelle:operator-agents'), HTTP_AUTHORIZATION=f'Bearer {key}')
                self.assertEqual(response.status_code, 200, response.content)
