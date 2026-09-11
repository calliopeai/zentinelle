"""Record authenticated workload acknowledgements for policy rollouts."""
from django.db import IntegrityError

from zentinelle.models import PolicyChangeAcknowledgement, PolicyChangeSet


def acknowledge_change_set(
    change_id, tenant_id, subject_type, subject_id, policy_version,
    acknowledgement_digest, metadata=None,
):
    """Create or update one acknowledgement for an authenticated subject."""
    change = PolicyChangeSet.objects.get(id=change_id, tenant_id=tenant_id)
    if change.status not in (
        PolicyChangeSet.Status.STAGED,
        PolicyChangeSet.Status.APPROVED,
        PolicyChangeSet.Status.PROMOTED,
    ):
        raise ValueError('Only staged or approved policy changes can be acknowledged')
    if not subject_type or not subject_id or not acknowledgement_digest:
        raise ValueError('Subject identity and acknowledgement digest are required')
    try:
        acknowledgement, _ = PolicyChangeAcknowledgement.objects.update_or_create(
            change_set=change,
            subject_type=subject_type,
            subject_id=str(subject_id),
            defaults={
                'tenant_id': tenant_id,
                'policy_version': policy_version if isinstance(policy_version, dict) else {},
                'acknowledgement_digest': str(acknowledgement_digest),
                'status': PolicyChangeAcknowledgement.Status.ACKNOWLEDGED,
                'metadata': metadata if isinstance(metadata, dict) else {},
            },
        )
    except IntegrityError as exc:
        raise ValueError('Acknowledgement could not be recorded') from exc
    return acknowledgement
