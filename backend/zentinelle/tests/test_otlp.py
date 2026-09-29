"""Host telemetry uses authenticated identity, capture policy and durable deduplication."""
from copy import deepcopy
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from zentinelle.models import Event
from zentinelle.tests.test_agent_host import AgentHostTestCase, host_tool_call


def batch(session='claude:/session-1'):
    return {'resourceSpans': [{'resource': {'attributes': [
        {'key': 'tenant_id', 'value': {'stringValue': 'another-tenant'}},
    ]}, 'scopeSpans': [{'spans': [{
        'traceId': '1' * 32, 'spanId': '2' * 16, 'name': 'agent.turn',
        'startTimeUnixNano': '1789990000000000000', 'endTimeUnixNano': '1789990001000000000',
        'attributes': [
            {'key': 'vscode.agent_host.session.uri', 'value': {'stringValue': session}},
            {'key': 'gen_ai.input.messages', 'value': {'stringValue': 'private prompt'}},
        ],
    }]}]}]}


@override_settings(AUTH_MODE='local', CONTENT_CAPTURE_MODE='metadata')
class OtlpTests(AgentHostTestCase):
    def post(self, data, key=None):
        with patch('zentinelle.api.views.events.EventsView._queue_events'):
            return self.as_agent(key or self.key).post(reverse('zentinelle:otlp-traces'), data, format='json')

    def test_correlates_with_evaluate_and_uses_the_keys_tenant(self):
        self.evaluate(host_tool_call(session_id='claude:/session-1'))
        response = self.post(batch())
        self.assertEqual((response.status_code, response.json()), (200, {}))
        span = Event.objects.get(tenant_id=self.host.tenant_id, event_type='agent_host.span')
        self.assertEqual(span.endpoint, self.host)
        self.assertEqual(span.payload['context']['session_id'], 'claude:/session-1')
        self.assertEqual(span.payload['duration_ms'], 1000)
        self.assertNotIn('content', span.payload)

    def test_retry_is_idempotent_and_conflict_is_refused(self):
        self.assertEqual(self.post(batch()).status_code, 200)
        self.assertEqual(self.post(batch()).status_code, 200)
        self.assertEqual(Event.objects.filter(tenant_id=self.host.tenant_id).count(), 1)
        self.assertEqual(self.post(batch('claude:/other')).status_code, 409)

    def test_whole_batch_validated_before_writes(self):
        for bad_span in ({'traceId': 'not-a-trace'}, {'endTimeUnixNano': '0'},
                         {'startTimeUnixNano': True}, {'spanId': '0' * 16}):
            data = batch()
            spans = data['resourceSpans'][0]['scopeSpans'][0]['spans']
            invalid = deepcopy(spans[0])
            invalid.update(bad_span)
            spans.append(invalid)
            self.assertEqual(self.post(data).status_code, 400)
        self.assertFalse(Event.objects.filter(tenant_id=self.host.tenant_id).exists())

    def test_requires_a_key_even_in_open_mode(self):
        with override_settings(AUTH_MODE='open'):
            response = APIClient().post(reverse('zentinelle:otlp-traces'), batch(), format='json')
        self.assertIn(response.status_code, [401, 403])

    def test_only_json_and_bounded_batches(self):
        response = self.as_agent(self.key).post(
            reverse('zentinelle:otlp-traces'), b'protobuf', content_type='application/x-protobuf')
        self.assertEqual(response.status_code, 415)
        data = batch()
        span = data['resourceSpans'][0]['scopeSpans'][0]['spans'][0]
        data['resourceSpans'][0]['scopeSpans'][0]['spans'] = [span] * 1001
        self.assertEqual(self.post(data).status_code, 400)

    def test_same_trace_from_two_tenants_never_shares_an_event(self):
        other, key = self.make_endpoint('another-host', 'agent_host', tenant_id='another-tenant')
        self.assertEqual(self.post(batch()).status_code, 200)
        self.assertEqual(self.post(batch(), key).status_code, 200)
        self.assertEqual(Event.objects.filter(tenant_id=other.tenant_id, endpoint=other).count(), 1)
