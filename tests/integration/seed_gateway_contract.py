"""Seed only an explicitly opted-in, disposable integration-test database.

Run with manage.py shell. Never point this fixture at an existing deployment.
"""
import json
import os
from pathlib import Path

from zentinelle.models import AgentEndpoint, Policy

if os.environ.get('ZENTINELLE_CONTRACT_TEST') != '1':
    raise RuntimeError('This fixture requires an explicitly opted-in disposable test database')

tenant = '00000000-0000-0000-0000-000000000001'
keys = {}
for name, status in [('allow', 'active'), ('revoked', 'suspended')]:
    key, hashed, prefix = AgentEndpoint.generate_api_key()
    AgentEndpoint.objects.update_or_create(
        tenant_id=tenant, agent_id='wire-' + name,
        defaults={'name': name, 'status': status, 'api_key_hash': hashed, 'api_key_prefix': prefix},
    )
    keys[name] = key
for name, kind, config in [
    ('Wire input safety', 'prompt_injection', {'scan_user_input': True, 'action_on_detect': 'block', 'sensitivity': 'high'}),
    ('Wire output safety', 'output_filter', {'block_pii': True}),
]:
    Policy.objects.update_or_create(tenant_id=tenant, name=name, defaults={
        'policy_type': kind, 'scope_type': 'organization', 'enforcement': 'enforce',
        'enabled': True, 'config': config,
    })
path = Path(os.environ['CONTRACT_KEYS_FILE'])
path.write_text(json.dumps(keys))
path.chmod(0o600)
