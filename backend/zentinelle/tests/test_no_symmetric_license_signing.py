"""Licences are not signed with a key that ships in the source (#262).

`license_service` used to mint offline licence tokens signed with HMAC-SHA256
under a key whose default was committed to this repository — and this
repository is MIT. The same key signed and verified, so anyone who could run
Zentinelle could mint a token asserting any `features`, `max_deployments`,
`max_agents` and `max_users` they liked, and this code would accept it.

Symmetric signing proves a token was not altered in transit. It cannot prove
Calliope Labs issued it. Only the second is what a licence is for.

The tokens are gone rather than re-keyed, because re-keying fixes the smell
and not the problem: the party a licence would prove something to is the same
party holding the key.
"""
import pathlib
import unittest

from django.test import TestCase

from zentinelle.services.license_service import LicenseService

SERVICE = pathlib.Path(__file__).resolve().parents[1] / 'services' / 'license_service.py'


class NoSymmetricLicenseSigningTest(unittest.TestCase):
    def test_the_service_signs_nothing(self):
        source = SERVICE.read_text()
        for banned in ('hmac.new', 'DEFAULT_SIGNING_KEY', 'def _sign'):
            self.assertNotIn(
                banned, source,
                f'{banned} is back in license_service. A licence signed with a key '
                'that ships in MIT source can be minted by anyone, so it proves '
                'nothing; if something must genuinely be gated in a customer copy '
                'it needs asymmetric signing, which is a decision rather than a '
                'key rotation.',
            )

    def test_no_committed_default_for_a_signing_secret(self):
        source = SERVICE.read_text()
        self.assertNotIn(
            'replace-in-production', source,
            'a committed default for a security-relevant secret makes the insecure '
            'configuration the one you get by doing nothing',
        )


class OfflineTokensAreRefusedTest(TestCase):
    def test_an_offline_token_is_refused_rather_than_ignored(self):
        """Told no, not quietly given an answer about something else.

        Falling through to another mode would report a result the caller would
        read as being about the token they supplied.
        """
        result = LicenseService().validate(offline_token='any-token-at-all')

        self.assertFalse(result.is_valid)
        self.assertEqual(result.mode, 'offline')
        self.assertIn('no longer supported', result.error)
