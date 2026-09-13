import hashlib
import hmac

from zentinelle.integrations.astrolift_audit import _signature_matches


def _presented(key, timestamp, body):
    digest = hmac.new(
        key.encode("ascii"), f"{timestamp}.".encode("ascii") + body, hashlib.sha256
    ).hexdigest()
    return f"sha256={digest}"


def test_signature_uses_astrolift_derived_key_for_plaintext_secret():
    secret = "operator-secret"
    body = b'{"event_id":"evt-1"}'
    derived = hashlib.sha256(secret.encode()).hexdigest()

    assert _signature_matches(secret, "1700000000", body, _presented(derived, "1700000000", body))


def test_signature_accepts_already_derived_secret():
    derived = hashlib.sha256(b"operator-secret").hexdigest()
    body = b'{"event_id":"evt-2"}'

    assert _signature_matches(derived, "1700000001", body, _presented(derived, "1700000001", body))
