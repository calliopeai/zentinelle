"""Run through manage.py shell against an isolated, migrated test deployment."""
import os
import uuid
from datetime import timedelta
from django.utils import timezone
from zentinelle.models import Event
from zentinelle.models.retention_policy import LegalHold
from zentinelle.services.clickhouse_service import _get_client, RETENTION_TABLES
from zentinelle.services.retention import enforce_retention
TENANT='00000000-0000-0000-0000-000000000001'
if os.environ.get('ZENTINELLE_CONTRACT_TEST') != '1':
    raise RuntimeError('Use only an explicitly opted-in disposable Postgres/ClickHouse test deployment')
client=_get_client()
assert client is not None
for table in RETENTION_TABLES:
    assert client.query('SELECT count() FROM '+table).result_rows[0][0] == 0, 'Use empty test analytics tables'
client.command("ALTER TABLE audit_events MODIFY TTL occurred_at + INTERVAL 10000 DAY")
client.command("INSERT INTO audit_events (event_id,event_type,event_category,organization_id,agent_id,action,resource_type,resource_id,occurred_at) VALUES ({event:UUID},'retention_contract','audit_log',{tenant:UUID},'fixture','test','test','test',now() - INTERVAL 500 DAY)",parameters={'event':str(uuid.uuid4()),'tenant':TENANT})
event=Event.objects.create(tenant_id=TENANT,event_type='retention_contract',event_category='audit',status='processed',occurred_at=timezone.now()-timedelta(days=500))
hold=LegalHold.objects.create(tenant_id=TENANT,name='ClickHouse contract hold',applies_to_all=True)
assert 'TTL' not in client.command('SHOW CREATE TABLE audit_events')
result=enforce_retention()
assert result['tenants_held']==1 and not result['tenants_failed'],result
assert Event.objects.filter(tenant_id=TENANT,pk=event.pk).exists()
for table in RETENTION_TABLES:assert client.query('SELECT count() FROM '+table).result_rows[0][0]==1,table
hold.release()
result=enforce_retention()
assert not result['tenants_failed'],result
assert not Event.objects.filter(tenant_id=TENANT,pk=event.pk).exists()
for table in RETENTION_TABLES:assert client.query('SELECT count() FROM '+table).result_rows[0][0]==0,table
print('Actual Postgres/ClickHouse contract passed: legacy TTL removed; active hold preserves all five stores; release permits expiry.')
