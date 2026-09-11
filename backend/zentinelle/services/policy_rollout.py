"""Transactional promotion checks for staged policy change sets."""
from django.db import transaction

from zentinelle.models import Policy, PolicyChangeSet

_MUTABLE_FIELDS = {
    'name', 'description', 'policy_type', 'config', 'priority', 'enabled',
    'enforcement', 'scope_type', 'scope_sub_organization_id_ext',
    'scope_deployment_id_ext', 'scope_user_id_ext', 'override_group',
    'non_overridable',
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
        'version': policy.version,
    }


@transaction.atomic
def promote_change_set(change_id, tenant_id, actor=''):
    """Apply an approved change set only if all base versions still match."""
    change = PolicyChangeSet.objects.select_for_update().get(
        id=change_id, tenant_id=tenant_id,
    )
    if change.status != PolicyChangeSet.Status.APPROVED:
        raise ValueError('Only approved policy changes can be promoted')
    if not isinstance(change.changes, list):
        raise ValueError('Policy changes must be a list')

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
