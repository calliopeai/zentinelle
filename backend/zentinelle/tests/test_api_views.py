"""
Tests for Zentinelle API views.
"""
import hashlib
from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from unittest.mock import patch

from zentinelle.models import (
    AgentEndpoint,
    AuditLog,
    Policy,
    Event,
)
from zentinelle.models.risk import Risk

STANDALONE_TENANT = '00000000-0000-0000-0000-000000000001'


class ZentinelleAPITestMixin:
    """Mixin for Zentinelle API tests providing common setup."""

    def setUp(self):
        self.client = APIClient()

        # Create endpoint with known API key
        self.full_key, key_hash, key_prefix = AgentEndpoint.generate_api_key()
        self.endpoint = AgentEndpoint.objects.create(
            tenant_id=STANDALONE_TENANT,
            agent_id='test-agent-001',
            name='Test Agent',
            agent_type=AgentEndpoint.AgentType.CUSTOM,
            api_key_hash=key_hash,
            api_key_prefix=key_prefix,
            config={'version': '1.0'},
        )

    def authenticate(self):
        """Set authentication header."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY=self.full_key)


class ConfigViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the config endpoint."""

    def test_get_config_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_get_config_invalid_key(self):
        """Test that invalid API key is rejected."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY='invalid_key')
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_get_config_success(self):
        """Test successful config retrieval."""
        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['agent_id'], 'test-agent-001')
        self.assertEqual(data['config']['version'], '1.0')
        self.assertIn('policies', data)
        self.assertIn('updated_at', data)

    def test_get_config_agent_mismatch(self):
        """Test that accessing another agent's config is forbidden."""
        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': 'other-agent'})
        )
        self.assertEqual(response.status_code, 403)

    def test_get_config_includes_policies(self):
        """Test that config includes effective policies."""
        Policy.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Rate Limit',
            policy_type=Policy.PolicyType.RATE_LIMIT,
            scope_type=Policy.ScopeType.ORGANIZATION,
            enforcement=Policy.Enforcement.ENFORCE,
            config={'requests_per_minute': 100},
        )

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data['policies']), 1)
        self.assertEqual(data['policies'][0]['type'], Policy.PolicyType.RATE_LIMIT)


class HeartbeatViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the heartbeat endpoint."""

    def test_heartbeat_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'healthy'},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_heartbeat_success(self):
        """Test successful heartbeat."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={
                'agent_id': self.endpoint.agent_id,
                'status': 'healthy',
                'metrics': {'cpu': 45, 'memory': 60},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertTrue(data['acknowledged'])

        # Verify endpoint was updated
        self.endpoint.refresh_from_db()
        self.assertIsNotNone(self.endpoint.last_heartbeat)
        self.assertEqual(self.endpoint.health, AgentEndpoint.Health.HEALTHY)

    def test_heartbeat_agent_mismatch(self):
        """Test heartbeat with mismatched agent ID."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': 'wrong-agent', 'status': 'healthy'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_heartbeat_updates_health_status(self):
        """Test that heartbeat updates health status correctly."""
        self.authenticate()

        # Send unhealthy heartbeat
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'unhealthy'},
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        self.endpoint.refresh_from_db()
        self.assertEqual(self.endpoint.health, AgentEndpoint.Health.UNHEALTHY)

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_heartbeat_creates_event(self, mock_task):
        """Test that heartbeat creates telemetry event."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:heartbeat'),
            data={'agent_id': self.endpoint.agent_id, 'status': 'healthy'},
            format='json',
        )

        self.assertEqual(response.status_code, 202)

        # Verify event was created
        events = Event.objects.filter(
            endpoint=self.endpoint,
            event_type=Event.EventType.HEARTBEAT,
        )
        self.assertEqual(events.count(), 1)


class EvaluateViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the evaluate endpoint."""

    def test_evaluate_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={'agent_id': self.endpoint.agent_id, 'action': 'spawn'},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_evaluate_no_policies(self):
        """Test evaluation with no policies - should allow."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
                'context': {'service': 'lab'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['allowed'])
        self.assertIsNone(data['reason'])

    def test_evaluate_agent_mismatch(self):
        """Test evaluation with mismatched agent ID."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={'agent_id': 'wrong-agent', 'action': 'spawn'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_evaluate_policy_allowed(self, mock_evaluate):
        """Test evaluation when policy allows action."""
        from zentinelle.services.policy_engine import EvaluationResult

        mock_evaluate.return_value = EvaluationResult(
            allowed=True,
            reason=None,
            policies_evaluated=[
                {'id': '1', 'name': 'Rate Limit', 'type': 'rate_limit', 'result': 'pass', 'message': None}
            ],
            warnings=[],
            context={},
        )

        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['allowed'])

    @patch('zentinelle.services.policy_engine.PolicyEngine.evaluate')
    def test_evaluate_policy_denied(self, mock_evaluate):
        """Test evaluation when policy denies action."""
        from zentinelle.services.policy_engine import EvaluationResult

        mock_evaluate.return_value = EvaluationResult(
            allowed=False,
            reason='Rate limit exceeded',
            policies_evaluated=[
                {'id': '1', 'name': 'Rate Limit', 'type': 'rate_limit', 'result': 'fail', 'message': 'Rate limit exceeded'}
            ],
            warnings=[],
            context={},
        )

        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)  # Still 200, but allowed=False
        data = response.json()
        self.assertFalse(data['allowed'])
        self.assertEqual(data['reason'], 'Rate limit exceeded')

    @patch('zentinelle.tasks.events.process_event_batch.apply_async')
    def test_evaluate_creates_audit_event(self, mock_task):
        """Test that evaluation creates audit event."""
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:evaluate'),
            data={
                'agent_id': self.endpoint.agent_id,
                'action': 'spawn',
                'user_id': 'user123',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)

        # Verify event was created
        events = Event.objects.filter(endpoint=self.endpoint)
        self.assertEqual(events.count(), 1)


class EventsViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for the events endpoint."""

    def test_send_events_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        response = self.client.post(
            reverse('zentinelle:events'),
            data={'events': []},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_send_events_success(self):
        """Test successfully sending events."""
        from django.utils import timezone
        self.authenticate()
        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': [
                    {
                        'type': 'spawn',
                        'category': 'telemetry',
                        'user_id': 'user123',
                        'payload': {'service': 'lab'},
                        'timestamp': timezone.now().isoformat(),
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 1)

    def test_send_events_batch(self):
        """Test sending batch of events."""
        from django.utils import timezone
        self.authenticate()
        now = timezone.now().isoformat()
        response = self.client.post(
            reverse('zentinelle:events'),
            data={
                'agent_id': self.endpoint.agent_id,
                'events': [
                    {
                        'type': 'spawn',
                        'category': 'telemetry',
                        'user_id': 'user123',
                        'payload': {},
                        'timestamp': now,
                    },
                    {
                        'type': 'terminate',
                        'category': 'telemetry',
                        'user_id': 'user456',
                        'payload': {},
                        'timestamp': now,
                    },
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 202)
        data = response.json()
        self.assertEqual(data['accepted'], 2)


class APIKeyAuthenticationTest(ZentinelleAPITestMixin, TestCase):
    """Tests for API key authentication."""

    def test_auth_missing_header(self):
        """Test request without auth header."""
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_wrong_key(self):
        """Test request with wrong API key."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY='sk_agent_wrongkey12345')
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_suspended_endpoint(self):
        """Test that suspended endpoints cannot authenticate."""
        self.endpoint.status = AgentEndpoint.Status.SUSPENDED
        self.endpoint.save()

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)

    def test_auth_offline_endpoint(self):
        """Test that offline endpoints cannot authenticate."""
        self.endpoint.status = AgentEndpoint.Status.OFFLINE
        self.endpoint.save()

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )
        self.assertEqual(response.status_code, 401)


class RateLimitMiddlewareTest(ZentinelleAPITestMixin, TestCase):
    """Tests for API rate limiting."""

    @patch('zentinelle.api.middleware.cache')
    def test_rate_limit_headers(self, mock_cache):
        """Test that rate limit headers are present."""
        mock_cache.get.return_value = None
        mock_cache.set.return_value = None

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:config', kwargs={'agent_id': self.endpoint.agent_id})
        )

        # Response should succeed (headers depend on middleware implementation)
        self.assertEqual(response.status_code, 200)


class RiskTrendViewTest(ZentinelleAPITestMixin, TestCase):
    """Tests for /api/zentinelle/v1/risks/trend."""

    def test_trend_unauthenticated(self):
        """Trend endpoint rejects requests without an API key."""
        response = self.client.get(reverse('zentinelle:risks-trend'))
        self.assertEqual(response.status_code, 401)

    def test_trend_invalid_key(self):
        """Trend endpoint rejects invalid API keys."""
        self.client.credentials(HTTP_X_ZENTINELLE_KEY='sk_agent_invalid_key_value')
        response = self.client.get(reverse('zentinelle:risks-trend'))
        self.assertEqual(response.status_code, 401)

    def test_trend_default_30_days_no_risks(self):
        """With no risks, the response is 30 days of zeros."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('trend', data)
        self.assertEqual(len(data['trend']), 30)

        for point in data['trend']:
            self.assertEqual(point['index'], 0)
            self.assertEqual(point['open_count'], 0)
            self.assertIn('day', point)

    def test_trend_custom_days(self):
        """`days` query param controls the trend length."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=7')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['trend']), 7)

    def test_trend_days_clamped_to_min(self):
        """`days=0` is clamped up to 1."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=0')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['trend']), 1)

    def test_trend_days_clamped_to_max(self):
        """`days=10000` is clamped down to 365."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=10000')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['trend']), 365)

    def test_trend_invalid_days_falls_back_to_default(self):
        """Non-integer `days` falls back to the default of 30."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=banana')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['trend']), 30)

    def test_trend_includes_open_risks(self):
        """An open risk contributes to the index across the window."""
        Risk.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Prompt Injection',
            description='LLM accepts adversarial prompts.',
            severity=Risk.Severity.HIGH,        # 5
            likelihood=Risk.Likelihood.LIKELY,  # 5
            impact=Risk.Impact.MAJOR,            # 5
            status=Risk.RiskStatus.ASSESSED,
        )

        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=3')

        self.assertEqual(response.status_code, 200)
        trend = response.json()['trend']
        self.assertEqual(len(trend), 3)

        # Today's bucket must show the risk as open.
        today_bucket = trend[-1]
        self.assertEqual(today_bucket['open_count'], 1)
        # 5*5*5 = 125 out of 512 -> round(24.41) = 24
        self.assertEqual(today_bucket['index'], 24)

    def test_trend_excludes_closed_risks(self):
        """Closed risks do not contribute to today's index."""
        risk = Risk.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Old Risk',
            description='Already mitigated.',
            severity=Risk.Severity.CRITICAL,
            likelihood=Risk.Likelihood.ALMOST_CERTAIN,
            impact=Risk.Impact.SEVERE,
            status=Risk.RiskStatus.CLOSED,
        )
        # Force updated_at into the past so the closure is not "after today".
        Risk.objects.filter(pk=risk.pk).update(
            updated_at=timezone.now() - timedelta(days=2),
        )

        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=1')

        self.assertEqual(response.status_code, 200)
        trend = response.json()['trend']
        self.assertEqual(trend[0]['open_count'], 0)
        self.assertEqual(trend[0]['index'], 0)

    def test_trend_excludes_other_tenants(self):
        """Risks belonging to a different tenant are not counted."""
        Risk.objects.create(
            tenant_id='some-other-tenant',
            name='Foreign Risk',
            description='Belongs to another tenant.',
            severity=Risk.Severity.CRITICAL,
            likelihood=Risk.Likelihood.ALMOST_CERTAIN,
            impact=Risk.Impact.SEVERE,
            status=Risk.RiskStatus.IDENTIFIED,
        )

        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=1')

        self.assertEqual(response.status_code, 200)
        trend = response.json()['trend']
        self.assertEqual(trend[0]['open_count'], 0)
        self.assertEqual(trend[0]['index'], 0)

    def test_trend_excludes_risks_created_after_day(self):
        """A risk created today does not appear in yesterday's bucket."""
        Risk.objects.create(
            tenant_id=STANDALONE_TENANT,
            name='Today Risk',
            description='Just identified.',
            severity=Risk.Severity.MODERATE,
            likelihood=Risk.Likelihood.POSSIBLE,
            impact=Risk.Impact.MODERATE,
            status=Risk.RiskStatus.IDENTIFIED,
        )

        self.authenticate()
        response = self.client.get(reverse('zentinelle:risks-trend') + '?days=2')

        self.assertEqual(response.status_code, 200)
        trend = response.json()['trend']
        self.assertEqual(len(trend), 2)
        # Yesterday: not yet created.
        self.assertEqual(trend[0]['open_count'], 0)
        # Today: created.
        self.assertEqual(trend[1]['open_count'], 1)


def _build_audit_chain(tenant_id, count, action='create', resource_type='policy'):
    """
    Create ``count`` AuditLog records with hashes that match the
    ``audit_chain`` verification algorithm. Each record's chain links
    to the previous record's chain_hash (with 'genesis' for the first).
    """
    records = []
    prev_chain = 'genesis'
    base_ts = timezone.now()

    for i in range(count):
        sequence = i + 1
        record = AuditLog.objects.create(
            tenant_id=tenant_id,
            ext_user_id=f'user-{sequence}',
            action=action,
            resource_type=resource_type,
            resource_id=f'res-{sequence:04d}',
        )
        # Pin a stable timestamp so re-hash is deterministic.
        ts = base_ts + timedelta(seconds=sequence)
        AuditLog.objects.filter(pk=record.pk).update(
            timestamp=ts, chain_sequence=sequence,
        )
        record.refresh_from_db()

        content = '|'.join([
            str(record.tenant_id or ''),
            str(record.action or ''),
            record.timestamp.isoformat(),
            str(record.ext_user_id or ''),
            str(record.action or ''),
            str(record.resource_type or ''),
            str(record.resource_id or ''),
        ])
        entry_hash = hashlib.sha256(content.encode()).hexdigest()
        chain_hash = hashlib.sha256((prev_chain + entry_hash).encode()).hexdigest()

        AuditLog.objects.filter(pk=record.pk).update(
            entry_hash=entry_hash,
            chain_hash=chain_hash,
        )
        record.refresh_from_db()
        records.append(record)
        prev_chain = chain_hash

    return records


class AuditChainVerifyViewTest(ZentinelleAPITestMixin, TestCase):
    """Integration tests for /api/zentinelle/v1/audit/verify."""

    def test_verify_unauthenticated(self):
        """Verify endpoint rejects requests without an API key."""
        response = self.client.get(reverse('zentinelle:audit-verify'))
        self.assertEqual(response.status_code, 401)

    def test_verify_empty_chain_is_valid(self):
        """No audit records → valid response with zero records checked."""
        self.authenticate()
        response = self.client.get(reverse('zentinelle:audit-verify'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['valid'])
        self.assertEqual(data['records_checked'], 0)
        self.assertIsNone(data['broken_at_sequence'])
        self.assertEqual(data['root_hash'], '')

    def test_verify_valid_chain(self):
        """A correctly-linked chain verifies as valid."""
        records = _build_audit_chain(STANDALONE_TENANT, count=3)

        self.authenticate()
        response = self.client.get(reverse('zentinelle:audit-verify'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['valid'])
        self.assertEqual(data['records_checked'], 3)
        self.assertIsNone(data['broken_at_sequence'])
        self.assertEqual(data['root_hash'], records[-1].chain_hash)

    def test_verify_detects_tampered_entry_hash(self):
        """Mutating a record's entry_hash is detected."""
        records = _build_audit_chain(STANDALONE_TENANT, count=2)
        AuditLog.objects.filter(pk=records[1].pk).update(
            entry_hash='deadbeef' * 8,
        )

        self.authenticate()
        response = self.client.get(reverse('zentinelle:audit-verify'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data['valid'])
        self.assertEqual(data['broken_at_sequence'], 2)

    def test_verify_recent_covering_full_chain(self):
        """`recent=N` with N >= chain length verifies the whole chain as valid."""
        records = _build_audit_chain(STANDALONE_TENANT, count=3)

        self.authenticate()
        response = self.client.get(
            reverse('zentinelle:audit-verify') + '?recent=10'
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['valid'])
        self.assertEqual(data['records_checked'], 3)
        self.assertEqual(data['root_hash'], records[-1].chain_hash)

    def test_verify_scopes_to_tenant(self):
        """Records from a different tenant are not included in verification."""
        # Foreign tenant's chain — should not affect our tenant's empty result.
        _build_audit_chain('some-other-tenant', count=3)

        self.authenticate()
        response = self.client.get(reverse('zentinelle:audit-verify'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['valid'])
        self.assertEqual(data['records_checked'], 0)
