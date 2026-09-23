"""Seed only an explicitly opted-in, disposable integration-test database.

Run with manage.py shell. Never point this fixture at an existing deployment.
"""
import json
import os
import secrets
from pathlib import Path

from zentinelle.models import (AgentEndpoint, GatewayCredential,
                               GatewayRegistration, LLMProviderKey, Policy)

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
# A second tenant behind the same gateway, and each tenant's own stored OpenAI
# key (#380). The values are random, so the gateway test can only match them
# by reading them back through the provider-key lookup.
second_tenant = '00000000-0000-0000-0000-000000000002'
key, hashed, prefix = AgentEndpoint.generate_api_key()
AgentEndpoint.objects.update_or_create(
    tenant_id=second_tenant, agent_id='wire-tenant-b',
    defaults={'name': 'tenant-b', 'status': 'active', 'api_key_hash': hashed, 'api_key_prefix': prefix},
)
keys['tenant_b'] = key
for name, tenant_id in [('openai_allow', tenant), ('openai_tenant_b', second_tenant)]:
    stored = 'sk-contract-' + secrets.token_hex(16)
    record, _ = LLMProviderKey.objects.get_or_create(tenant_id=tenant_id, provider='openai')
    record.set_key(stored)
    record.is_active = True
    record.save()
    keys[name] = stored
# A gateway registered for both tenants, as one serving a shared cluster is.
registration, _ = GatewayRegistration.objects.update_or_create(
    name='wire-contract', defaults={'tenant_ids': [tenant, second_tenant], 'cluster_id': 'wire'})
keys['gateway_credential'], _ = GatewayCredential.mint(registration)
path = Path(os.environ['CONTRACT_KEYS_FILE'])
path.write_text(json.dumps(keys))
path.chmod(0o600)
