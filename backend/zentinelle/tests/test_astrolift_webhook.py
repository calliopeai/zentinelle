"""Signed Astrolift webhook contract tests."""

import hashlib
import hmac
import json
import time
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from zentinelle.models import (AstroliftAuditDelivery, AstroliftIntegration,
                               AuditLog)
from zentinelle.models.usage import UsageMetric


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


class AstroliftModelSpendDeliveryTests(TestCase):
    """A spend event must be metered exactly once across webhook retries."""
    databases = {'default', 'zentinelle', 'analytics'}

    def setUp(self):
        self.client = APIClient()
        self.secret = 'astrolift-spend-secret'
        AstroliftIntegration.objects.create(
            tenant_id='tenant-spend', astrolift_org_id=4343,
            signing_secret=self.secret,
        )

    def post(self, payload, event_id='evt-spend-1'):
        body = json.dumps({
            'payload_version': 1,
            'event_type': 'AUDIT.agent.model_spend',
            'event_id': event_id,
            'org_id': 4343,
            'occurred_at_unix': int(time.time()),
            'payload': payload,
            'idempotency_key': f'zentinelle-4343-{event_id}',
        }).encode()
        timestamp = int(time.time())
        key = hashlib.sha256(self.secret.encode()).hexdigest()
        digest = hmac.new(
            key.encode(), f'{timestamp}.'.encode() + body, hashlib.sha256,
        ).hexdigest()
        return self.client.post(
            '/integrations/astrolift/v1/audit', body,
            content_type='application/json',
            HTTP_X_ASTROLIFT_SIGNATURE=f'sha256={digest}',
            HTTP_X_ASTROLIFT_TIMESTAMP=str(timestamp),
            HTTP_X_ASTROLIFT_DELIVERY_ID='delivery-spend-1',
        )

    def spend(self, **overrides):
        payload = {'agent_slug': 'coding-agent', 'provider': 'openai',
                   'model_id': 'gpt-4o', 'input_tokens': 1000,
                   'output_tokens': 500, 'task_id': 'task-1'}
        payload.update(overrides)
        return payload

    def input_tokens(self):
        return sum(m.value for m in UsageMetric.objects.filter(
            tenant_id='tenant-spend', metric_type='ai_input_tokens'))

    def test_a_failed_spend_write_is_recorded_by_the_retry(self):
        with mock.patch.object(UsageMetric, 'record_ai_usage',
                               side_effect=RuntimeError('analytics blip')):
            with self.assertRaises(RuntimeError):
                self.post(self.spend())

        # Nothing half-written: no marker suppressing the retry, and no
        # evidence row for the retry to duplicate.
        self.assertFalse(AstroliftAuditDelivery.objects.exists())
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-spend').count(), 0)

        retry = self.post(self.spend())
        self.assertEqual(retry.status_code, 202, retry.content)
        self.assertEqual(self.input_tokens(), 1000)
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-spend').count(), 1)

        again = self.post(self.spend())
        self.assertEqual(again.json()['status'], 'duplicate')
        self.assertEqual(self.input_tokens(), 1000)

    def test_a_malformed_spend_payload_is_refused_without_a_marker(self):
        response = self.post(self.spend(input_tokens=1000.0))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'bad_payload')
        self.assertFalse(AstroliftAuditDelivery.objects.exists())
        self.assertEqual(AuditLog.objects.filter(tenant_id='tenant-spend').count(), 0)

        # The corrected redelivery under the same event id is accepted.
        fixed = self.post(self.spend())
        self.assertEqual(fixed.status_code, 202, fixed.content)
        self.assertEqual(self.input_tokens(), 1000)
