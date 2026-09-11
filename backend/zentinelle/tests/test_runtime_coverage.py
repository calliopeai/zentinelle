from django.test import TestCase
from django.utils import timezone

from zentinelle.api.views.control_evidence import runtime_coverage
from zentinelle.models import AgentEndpoint, Event


class RuntimeCoverageTests(TestCase):
    def endpoint(self, agent_id):
        key, key_hash, prefix = AgentEndpoint.generate_api_key()
        return AgentEndpoint.objects.create(
            tenant_id='tenant-a', agent_id=agent_id, name=agent_id,
            api_key_hash=key_hash, api_key_prefix=prefix,
        )

    def test_inventory_distinguishes_observed_and_unknown_workloads(self):
        observed = self.endpoint('observed')
        unknown = self.endpoint('unknown')
        Event.objects.create(
            tenant_id='tenant-a', endpoint=observed, event_type='ai_request',
            occurred_at=timezone.now(),
        )
        event = Event.objects.filter(endpoint=observed).values('id', 'occurred_at', 'event_type').get()
        event_time = event['occurred_at']
        result = runtime_coverage('tenant-a')
        self.assertEqual(result['registered_workloads'], 2)
        self.assertEqual(result['observed_workloads'], 1)
        self.assertEqual(result['unobserved_workloads'], 1)
        by_agent = {row['agent_id']: row['status'] for row in result['workloads']}
        self.assertEqual(by_agent, {'observed': 'observed', 'unknown': 'unknown'})
        observed_row = next(row for row in result['workloads'] if row['agent_id'] == 'observed')
        self.assertEqual(observed_row['last_observed_at'], event_time.isoformat())
        self.assertEqual(result['coverage_as_of'], event_time.isoformat())
        self.assertEqual(observed_row['last_event_id'], str(event['id']))
        self.assertEqual(observed_row['last_event_type'], event['event_type'])

    def test_tenant_isolation(self):
        self.endpoint('tenant-a-agent')
        other = self.endpoint('other-agent')
        other.tenant_id = 'tenant-b'
        other.save(update_fields=['tenant_id'])
        result = runtime_coverage('tenant-a')
        self.assertEqual(result['registered_workloads'], 1)
        self.assertEqual(result['workloads'][0]['agent_id'], 'tenant-a-agent')
