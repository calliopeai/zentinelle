"""Captured evidence keeps the UUIDs it names (#404).

The drivers_license (`[A-Z]\\d{7,8}`) and passport (`[A-Z]{1,2}\\d{6,9}`)
patterns run with IGNORECASE, so they matched a UUID whose first segment is
one or two hex letters followed by digits, and a stored id stopped resolving.
"""
from django.test import SimpleTestCase

from zentinelle.services.content_capture import capture_payload, redact_text

# First segment a letter and seven digits: the drivers_license shape.
LICENSE_SHAPED = 'e4082135-a69f-4bba-aa1a-68e90fa0eb7b'
# Two letters and six digits: the passport shape.
PASSPORT_SHAPED = 'ab123456-0c1d-4e2f-8a9b-0123456789ab'


class UuidRedactionTests(SimpleTestCase):
    def test_a_uuid_is_not_redacted(self):
        self.assertEqual(redact_text(LICENSE_SHAPED), LICENSE_SHAPED)
        self.assertEqual(redact_text(PASSPORT_SHAPED), PASSPORT_SHAPED)
        self.assertEqual(redact_text(LICENSE_SHAPED.upper()), LICENSE_SHAPED.upper())

    def test_pii_next_to_a_uuid_is_still_redacted(self):
        text = f'policy {LICENSE_SHAPED} matched license A1234567 for bob@example.com'

        self.assertEqual(redact_text(text), f'policy {LICENSE_SHAPED} matched license [REDACTED] for [REDACTED]')

    def test_a_uuid_inside_an_email_address_is_still_redacted(self):
        self.assertNotIn('example.com', redact_text(f'{LICENSE_SHAPED}@example.com'))

    def test_a_payload_round_trips_its_ids_under_any_key(self):
        payload = {
            'policy_id': LICENSE_SHAPED,
            'id': PASSPORT_SHAPED,
            'changes': {'endpoint_id': {'old': PASSPORT_SHAPED, 'new': LICENSE_SHAPED}},
            'references': [LICENSE_SHAPED, {'approval': PASSPORT_SHAPED}],
            'note': 'licence A1234567',
        }

        for mode in ('metadata', 'redacted'):
            with self.subTest(mode=mode):
                self.assertEqual(capture_payload(payload, _mode=mode), {**payload, 'note': 'licence [REDACTED]'})
