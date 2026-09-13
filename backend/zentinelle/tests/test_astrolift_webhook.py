"""Signed Astrolift webhook contract tests."""

import hashlib
import hmac
import json
import time

from django.test import TestCase
from rest_framework.test import APIClient

from zentinelle.models import AstroliftIntegration, AuditLog


class AstroliftWebhookContractTests(TestCase):
    databases = {'default', 'zentinelle', 'analytics'}

    def setUp(self):
        self.client = APIClient()
        self.secret = 'astrolift-contract-secret'
        AstroliftIntegration.objects.create(
            tenant_id='tenant-contract', astrolift_org_id=4242,
            signing_secret=self.secret,
        )

    def envelope(self, event_id='evt-contract-1'):
        return {
            'payload_version': 1,
            'event_type': 'AUDIT.agent.task.completed',
            'event_id': event_id,
            'org_id': 4242,
            'occurred_at_unix': int(time.time()),
            'payload': {'agent_slug': 'coding-agent', 'status': 'completed'},
            'idempotency_key': f'zentinelle-4242-{event_id}',
        }

    def headers(self, body, timestamp, secret=None):
        key = hashlib.sha256((secret or self.secret).encode()).hexdigest()
        digest = hmac.new(
            key.encode(), f'{timestamp}.'.encode() + body, hashlib.sha256,
        ).hexdigest()
        return {
            'HTTP_X_ASTROLIFT_SIGNATURE': f'sha256={digest}',
            'HTTP_X_ASTROLIFT_TIMESTAMP': str(timestamp),
            'HTTP_X_ASTROLIFT_EVENT_ID': 'evt-contract-1',
            'HTTP_X_ASTROLIFT_DELIVERY_ID': 'delivery-contract-1',
        }

    def test_signed_delivery_is_written_once_and_retry_is_idempotent(self):
        body = json.dumps(self.envelope()).encode()
        response = self.client.post(
            '/integrations/astrolift/v1/audit', body,
            content_type='application/json', **self.headers(body, int(time.time())),
        )
        self.assertEqual(response.status_code, 202)
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-contract').count(), 1)

        retry = self.client.post(
            '/integrations/astrolift/v1/audit', body,
            content_type='application/json', **self.headers(body, int(time.time())),
        )
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['status'], 'duplicate')
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-contract').count(), 1)

    def test_bad_signature_never_writes_evidence(self):
        body = json.dumps(self.envelope('evt-contract-2')).encode()
        headers = self.headers(body, int(time.time()), secret='wrong-secret')
        response = self.client.post(
            '/integrations/astrolift/v1/audit', body,
            content_type='application/json', **headers,
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-contract').count(), 0)
