"""Bootstrap token limits hold under concurrent registrations (T11)."""
import threading
from unittest.mock import patch

from django.db import connection
from django.test import TestCase, TransactionTestCase

from zentinelle.models.bootstrap_token import BootstrapToken
from zentinelle.tests._two_tenants import TENANT_A


class ConcurrentUseTests(TransactionTestCase):
    def race(self, token_string, threads=2):
        # Hold every caller just after it has read the token as valid, the
        # window in which the old read-then-save let each one through.
        barrier = threading.Barrier(threads, timeout=2)
        real = BootstrapToken.is_valid.fget

        def held(record):
            valid = real(record)
            try:
                barrier.wait()
            except threading.BrokenBarrierError:
                pass
            return valid

        results = []

        def register():
            try:
                results.append(BootstrapToken.validate(token_string)[0])
            finally:
                connection.close()

        with patch.object(BootstrapToken, 'is_valid', property(held)):
            workers = [threading.Thread(target=register) for _ in range(threads)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()
        return [tenant for tenant in results if tenant]

    def test_a_single_use_token_registers_once(self):
        token_string, record = BootstrapToken.generate(TENANT_A)
        BootstrapToken.objects.filter(pk=record.pk).update(single_use=True)

        self.assertEqual(len(self.race(token_string)), 1)
        record.refresh_from_db()
        self.assertTrue(record.revoked)

    def test_max_uses_is_a_ceiling(self):
        token_string, record = BootstrapToken.generate(TENANT_A)
        BootstrapToken.objects.filter(pk=record.pk).update(max_uses=1)

        self.assertEqual(len(self.race(token_string)), 1)
        record.refresh_from_db()
        self.assertEqual(record.use_count, 1)


class RefusedTokenTests(TestCase):
    def test_a_refused_database_token_is_not_tried_as_hmac(self):
        token_string, record = BootstrapToken.generate(TENANT_A)
        BootstrapToken.objects.filter(pk=record.pk).update(revoked=True)
        from zentinelle.api.views.register import BootstrapTokenPermission
        request = type('Request', (), {'META': {'HTTP_X_ZENTINELLE_BOOTSTRAP': token_string}})()

        with patch.object(BootstrapTokenPermission, '_validate_hmac', return_value=True) as hmac_check:
            self.assertFalse(BootstrapTokenPermission().has_permission(request, None))
        hmac_check.assert_not_called()

    def test_unlimited_tokens_keep_counting(self):
        token_string, record = BootstrapToken.generate(TENANT_A)
        for _ in range(3):
            self.assertEqual(BootstrapToken.validate(token_string)[0], TENANT_A)
        record.refresh_from_db()
        self.assertEqual((record.use_count, record.revoked), (3, False))
        self.assertIsNotNone(record.last_used_at)
