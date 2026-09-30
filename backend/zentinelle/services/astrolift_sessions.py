"""Observed runner evidence and durable, install-scoped policy actions."""
import hashlib
import hmac
import json
import uuid
from datetime import datetime
from datetime import timezone as dt_timezone

from django.utils import timezone

from zentinelle.models import (AgentEndpoint, AstroliftCluster,
                               AstroliftEnforcement, AstroliftInstall, Event)
from zentinelle.services.content_capture import capture_payload
from zentinelle.services.policy_engine import PolicyEngine

KINDS = frozenset({'turn_started', 'turn_completed', 'turn_failed', 'turn_cancelled', 'stop_requested',
                   'tool_call_started', 'tool_call_input', 'tool_call_result', 'tool_call_completed',
                   'tool_call_failed', 'approval_required', 'input_required', 'input_resolved',
                   'assistant_delta', 'message_end'})


def canonical_body(body):
    return json.dumps(body, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sign_action(body, credential):
    key = hashlib.sha256(credential.encode()).digest()
    return 'sha256=' + hmac.new(key, canonical_body(body), hashlib.sha256).hexdigest()


def validate_evidence(tenant_id, payload):
    required = {'task_id', 'sequence', 'kind', 'turn_id', 'message_id', 'data', 'install_id', 'agent_id',
                'cluster_id', 'team_id', 'project_id', 'harness', 'declared_intent'}
    if not required <= payload.keys() or len(canonical_body(payload)) > 32 * 1024:
        raise ValueError('Invalid or oversized session evidence')
    for field in ('task_id', 'install_id'):
        uuid.UUID(payload[field])
    for field in ('cluster_id', 'team_id', 'project_id'):
        if payload[field]:
            uuid.UUID(payload[field])
    if type(payload['sequence']) is not int or not 1 <= payload['sequence'] <= 100000 or payload['kind'] not in KINDS:
        raise ValueError('Invalid session event identity')
    if not isinstance(payload['data'], dict) or not isinstance(payload['declared_intent'], dict):
        raise ValueError('Structured data and declared intent are required')
    for field in ('agent_id', 'turn_id', 'message_id', 'harness'):
        if not isinstance(payload[field], str) or not 1 <= len(payload[field]) <= 128:
            raise ValueError('Invalid session correlation')
    install = AstroliftInstall.objects.filter(pk=payload['install_id'], tenant_ids__contains=[tenant_id],
                                              revoked_at__isnull=True).first()
    if install is None:
        raise ValueError('Session install is outside the integration tenant')
    endpoint = AgentEndpoint.objects.filter(tenant_id=tenant_id, astrolift_install=install,
                                            agent_id=payload['agent_id']).first()
    if endpoint is None:
        raise ValueError('Session agent is outside the minting install')
    if payload['cluster_id']:
        cluster = AstroliftCluster.objects.filter(install=install, external_id=payload['cluster_id'],
                                                  revoked_at__isnull=True).first()
        registration = cluster.active_registration() if cluster else None
        if registration is None or tenant_id not in registration.tenant_ids:
            raise ValueError('Session cluster is outside the integration tenant')
    return endpoint


def observe(tenant_id, envelope, endpoint, evidence_id):
    payload = envelope['payload']
    identifier = uuid.uuid5(uuid.NAMESPACE_URL, f'astrolift:{tenant_id}:{envelope["event_id"]}')
    event, created = Event.objects.get_or_create(
        tenant_id=tenant_id, id=identifier,
        defaults={'endpoint': endpoint, 'event_type': 'agent_session.' + payload['kind'],
                  'event_category': Event.Category.AUDIT, 'status': Event.Status.PENDING,
                  'occurred_at': datetime.fromtimestamp(envelope['occurred_at_unix'], tz=dt_timezone.utc),
                  'payload': capture_payload(payload, tenant_id)})
    if not created and event.status == Event.Status.PROCESSED:
        return event
    # Evaluate observed input, not a fabricated pre-tool event. A late block
    # may need gateway-key revocation when the harness has already run the tool.
    if payload['kind'] not in ('tool_call_input', 'approval_required') or not payload.get('tool_name'):
        event.status, event.processed_at = Event.Status.PROCESSED, timezone.now()
        event.save(update_fields=['status', 'processed_at'])
        return event
    context = {'harness': payload['harness'], 'session_id': f'ahp-session:/{payload["task_id"]}',
               'chat_id': f'ahp-session:/{payload["task_id"]}/chat', 'tool_call_id': payload.get('tool_call_id') or payload['message_id'],
               'tool_name': payload['tool_name'], 'tool_input': payload['data'].get('input', {}),
               'astrolift': {'cluster_id': payload['cluster_id'], 'team_id': payload['team_id'],
                             'project_id': payload['project_id'], 'declared_intent': payload['declared_intent']}}
    result = PolicyEngine().evaluate(endpoint, 'tool_call', context=context)
    decision = result.enforcement
    action = decision.get('action')
    if action is None:
        event.status, event.processed_at = Event.Status.PROCESSED, timezone.now()
        event.save(update_fields=['status', 'processed_at'])
        return event
    rule = decision.get('rule') or {}
    body = {'target_kind': 'task', 'target_id': payload['task_id'], 'cluster_id': payload['cluster_id'],
            'agent_id': endpoint.agent_id, 'action': action, 'block_level': decision.get('block_level'),
            'mode': decision.get('mode') or 'audit', 'policy_id': str(rule.get('id') or ''),
            'policy_name': str(rule.get('name') or ''), 'reason': str(result.reason or '')[:1000],
            'message': str(decision.get('message') or '')[:4000],
            'evidence_url': f'/api/zentinelle/v1/audit/{evidence_id}',
            'turn_id': payload['turn_id'], 'tool_call_id': payload.get('tool_call_id') or payload['message_id']}
    AstroliftEnforcement.objects.get_or_create(
        tenant_id=tenant_id, install=endpoint.astrolift_install, evidence_id=str(envelope['event_id']),
        defaults={'endpoint': endpoint, 'payload': body})
    event.status, event.processed_at = Event.Status.PROCESSED, timezone.now()
    event.save(update_fields=['status', 'processed_at'])
    return event


def signed_delivery(record, credential):
    body = {**record.payload, 'version': 1, 'action_id': str(record.pk), 'tenant_id': record.tenant_id,
            'install_id': str(record.install_id), 'nonce': str(uuid.uuid4()),
            'expires_at': int(timezone.now().timestamp()) + 60}
    return {'body': body, 'signature': sign_action(body, credential)}
