"""The relay global-ID helpers decode what graphql-relay 3.2.0 encoded.

The expected values were produced by graphql-relay itself before it was
removed with graphene-django, so IDs the portal already holds keep working.
"""
from django.test import SimpleTestCase

from zentinelle.schema.global_id import from_global_id, to_global_id


class GlobalIdTests(SimpleTestCase):
    def test_encoding_matches_graphql_relay(self):
        self.assertEqual(to_global_id('AgentEndpoint', 'abc'), 'QWdlbnRFbmRwb2ludDphYmM=')
        self.assertEqual(to_global_id('Risk', 7), 'Umlzazo3')
        self.assertEqual(to_global_id('X', 'é'), 'WDrDqQ==')

    def test_decoding_matches_graphql_relay(self):
        for value, expected in {
            'QWdlbnRFbmRwb2ludDphYmM=': ('AgentEndpoint', 'abc'),
            'UG9saWN5Ong6eQ==': ('Policy', 'x:y'),
            'YWJj': ('', 'abc'),
            # Not a global ID: callers fall back to the raw value.
            'e4082135-a69f-4bba-aa1a-68e90fa0eb7b': ('', ''),
            '42': ('', ''),
            'not base64!': ('', ''),
            'é': ('', ''),
            '': ('', ''),
        }.items():
            with self.subTest(value=value):
                self.assertEqual(from_global_id(value), expected)
