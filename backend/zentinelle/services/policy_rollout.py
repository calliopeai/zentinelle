"""Transactional promotion checks for staged policy change sets."""
from types import SimpleNamespace

from django.db import router, transaction

from zentinelle.models import (Policy, PolicyChangeAcknowledgement,
                               PolicyChangeSet)

_MUTABLE_FIELDS = {
    'name', 'description', 'policy_type', 'config', 'priority', 'enabled',
    'enforcement', 'scope_type', 'scope_sub_organization_id_ext',
    'scope_deployment_id_ext', 'scope_user_id_ext', 'override_group',
    'non_overridable', 'scope_endpoint_id',
    'action', 'block_level', 'steer_message', 'escalation',
}


def _snapshot(policy):
    return {
        'id': str(policy.id),
        'name': policy.name,
        'description': policy.description,
        'policy_type': policy.policy_type,
        'config': policy.config,
        'priority': policy.priority,
        'enabled': policy.enabled,
        'enforcement': policy.enforcement,
        'scope_type': policy.scope_type,
        'scope_sub_organization_id_ext': policy.scope_sub_organization_id_ext,
        'scope_deployment_id_ext': policy.scope_deployment_id_ext,
        'scope_endpoint_id': str(policy.scope_endpoint_id) if policy.scope_endpoint_id else None,
        'scope_user_id_ext': policy.scope_user_id_ext,
        'override_group': policy.override_group,
        'non_overridable': policy.non_overridable,
        'action': policy.action,
        'block_level': policy.block_level,
        'steer_message': policy.steer_message,
        'escalation': policy.escalation,
        'version': policy.version,
    }


def _refuses(fields):
    from zentinelle.services.actions import ACTION_DEFAULTS, can_refuse
    rule = SimpleNamespace(action=fields.get('action', ACTION_DEFAULTS['action']),
                           escalation=fields.get('escalation') or {})
    return (fields.get('enabled', True) and fields.get('enforcement', Policy.Enforcement.ENFORCE)
            == Policy.Enforcement.ENFORCE and can_refuse(rule))


def weakening_changes(change):
    """The changes after which a policy can no longer refuse a call (#413).

    A new policy in enforce mode whose action only logs, alerts, warns or
    steers reads as enforced and lets every call through, so it is flagged
    too. Reviewers see these before they approve.
    """
    if not isinstance(change.changes, list):
        return []
    items = [item for item in change.changes if isinstance(item, dict)]
    ids = [str(item['policy_id']) for item in items
           if item.get('policy_id') and not str(item['policy_id']).startswith('new:')]
    current = {str(p.id): p for p in Policy.objects.filter(tenant_id=change.tenant_id, id__in=ids)} if ids else {}
    flagged = []
    for item in items:
        policy = current.get(str(item.get('policy_id')))
        before = _snapshot(policy) if policy else None
        after = {**(before or {}), **{key: item[key] for key in _MUTABLE_FIELDS if key in item}}
        if before is None:
            weakens = not _refuses(after) and _refuses({**after, 'action': 'block', 'escalation': {}})
        else:
            weakens = _refuses(before) and not _refuses(after)
        if not weakens:
            continue
        flagged.append({'policy_id': str(item.get('policy_id') or ''), 'name': after.get('name', ''),
                        'enforcement': after.get('enforcement', Policy.Enforcement.ENFORCE),
                        'action': after.get('action', 'block')})
    return flagged


def promote_change_set(change_id, tenant_id, actor=''):
    """Apply an approved change set only if all base versions still match."""
    # The models' own database: an atomic block on another alias leaves
    # select_for_update outside any transaction.
    with transaction.atomic(using=router.db_for_write(PolicyChangeSet)):
        return _promote_change_set(change_id, tenant_id, actor)


def _promote_change_set(change_id, tenant_id, actor):
    change = PolicyChangeSet.objects.select_for_update().get(
        id=change_id, tenant_id=tenant_id,
    )
    if change.status != PolicyChangeSet.Status.APPROVED:
        raise ValueError('Only approved policy changes can be promoted')
    if not isinstance(change.changes, list):
        raise ValueError('Policy changes must be a list')
    required_acks = change.validation.get('required_acknowledgements', [])
    if required_acks:
        acknowledged = set(
            PolicyChangeAcknowledgement.objects.filter(
                change_set=change,
                tenant_id=tenant_id,
                status=PolicyChangeAcknowledgement.Status.ACKNOWLEDGED,
            ).values_list('subject_type', 'subject_id')
        )
        missing = [
            item for item in required_acks
            if isinstance(item, dict)
            and (item.get('subject_type'), str(item.get('subject_id'))) not in acknowledged
        ]
        if missing:
            raise ValueError(f'Required policy acknowledgements are missing: {missing}')

    policies = []
    for item in change.changes:
        if not isinstance(item, dict):
            raise ValueError('Each policy change must be an object')
        policy_id = item.get('policy_id')
        if not policy_id or str(policy_id).startswith('new:'):
            policies.append((None, item))
            continue
        try:
            policy = Policy.objects.select_for_update().get(
                id=policy_id, tenant_id=tenant_id,
            )
        except Policy.DoesNotExist as exc:
            raise ValueError(f'Policy {policy_id} was not found in this tenant') from exc
        expected = change.base_versions.get(str(policy.id))
        if expected is None or int(expected) != policy.version:
            raise ValueError(
                f'Policy {policy.id} changed since this draft was created; revalidate before promotion'
            )
        policies.append((policy, item))

    snapshots = []
    for policy, item in policies:
        if policy is None:
            fields = {key: item[key] for key in _MUTABLE_FIELDS if key in item}
            required = {'name', 'policy_type', 'config'}
            if not required.issubset(fields):
                raise ValueError('New policies require name, policy_type, and config')
            policy = Policy(tenant_id=tenant_id, **fields)
            snapshots.append({'policy_id': str(policy.id), 'existed': False, 'snapshot': None})
        else:
            snapshots.append({'policy_id': str(policy.id), 'existed': True, 'snapshot': _snapshot(policy)})
            for key in _MUTABLE_FIELDS:
                if key in item:
                    setattr(policy, key, item[key])
        policy._changed_by = actor or change.created_by
        policy._change_summary = f'Promoted policy change set {change.id}'
        policy.save()

    change.applied_snapshots = snapshots
    change.transition(PolicyChangeSet.Status.PROMOTED, actor=actor)
    return change


def rollback_change_set(change_id, tenant_id, actor=''):
    """Restore pre-promotion fields for a promoted change set."""
    with transaction.atomic(using=router.db_for_write(PolicyChangeSet)):
        return _rollback_change_set(change_id, tenant_id, actor)


def _rollback_change_set(change_id, tenant_id, actor):
    change = PolicyChangeSet.objects.select_for_update().get(
        id=change_id, tenant_id=tenant_id,
    )
    if change.status != PolicyChangeSet.Status.PROMOTED:
        raise ValueError('Only promoted policy changes can be rolled back')
    if not isinstance(change.applied_snapshots, list) or not change.applied_snapshots:
        raise ValueError('No promotion snapshots are available for rollback')

    for entry in change.applied_snapshots:
        policy_id = entry.get('policy_id')
        if not entry.get('existed'):
            Policy.objects.filter(id=policy_id, tenant_id=tenant_id).delete()
            continue
        snapshot = entry.get('snapshot') or {}
        try:
            policy = Policy.objects.select_for_update().get(
                id=policy_id, tenant_id=tenant_id,
            )
        except Policy.DoesNotExist as exc:
            raise ValueError(f'Policy {policy_id} is missing; rollback is incomplete') from exc
        for key in _MUTABLE_FIELDS:
            if key in snapshot:
                setattr(policy, key, snapshot[key])
        policy._changed_by = actor or change.created_by
        policy._change_summary = f'Rolled back policy change set {change.id}'
        policy.save()

    change.transition(PolicyChangeSet.Status.ROLLED_BACK, actor=actor)
    return change
