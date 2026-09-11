"""Bind approval to identity, semantic arguments and current policy versions."""
import hashlib
import json
from datetime import timedelta

from django.core import signing
from django.db import router, transaction
from django.utils import timezone

from zentinelle.models.approval import ExecutionApproval
from zentinelle.services.evaluators.base import PolicyResult

SALT = 'zentinelle-execution-approval-v1'


def context_digest(context):
    excluded = {'approval_token', 'request_id'}
    canonical = {k: v for k, v in context.items() if not k.startswith('_') and k not in excluded}
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def issue_approval(*, tenant_id, kind, subject, action, context, endpoint_id='',
                   policies=(), granted_by='', timeout=300):
    if not tenant_id or kind not in ('policy', 'assistant'):
        raise ValueError('A tenant and recognized approval kind are required')
    if kind == 'policy' and (not endpoint_id or not granted_by):
        raise ValueError('Policy approvals require a workload and human approver')
    if any(p.tenant_id != tenant_id for p in policies):
        raise ValueError('Approval policies must belong to the tenant')
    approval = ExecutionApproval.objects.create(
        tenant_id=tenant_id, kind=kind, subject=str(subject or ''), action=action,
        context_digest=context_digest(context), endpoint_id_ext=str(endpoint_id),
        policy_versions={str(p.id): p.version for p in policies}, granted_by=str(granted_by),
        expires_at=timezone.now() + timedelta(seconds=max(1, min(int(timeout), 300))),
    )
    return signing.dumps(str(approval.pk), salt=SALT)


def find_approval(token, *, tenant_id, kind, subject, action, digest, endpoint_id=''):
    try:
        approval_id = signing.loads(token, salt=SALT, max_age=300)
        return ExecutionApproval.objects.filter(
            pk=approval_id, tenant_id=tenant_id, kind=kind, subject=str(subject or ''),
            action=action, context_digest=digest, endpoint_id_ext=str(endpoint_id),
            consumed_at__isnull=True, expires_at__gt=timezone.now(),
        ).first()
    except (signing.BadSignature, ValueError, TypeError):
        return None


def validate_policy_approval(policy, action, user_id, context):
    approval = find_approval(
        context.get('approval_token'), tenant_id=context.get('_tenant_id', ''), kind='policy',
        subject=user_id, action=action, endpoint_id=context.get('_endpoint_id', ''),
        digest=context.get('_approval_digest') or context_digest(context),
    )
    if not approval or approval.policy_versions.get(str(policy.id)) != policy.version:
        return PolicyResult(passed=False, message='A current approval for this identity and exact action is required')
    if (timezone.now() - approval.created_at).total_seconds() > policy.config.get('approval_timeout_seconds', 300):
        return PolicyResult(passed=False, message='Approval has expired')
    ids = context.setdefault('_validated_approval_ids', [])
    if str(approval.pk) not in ids:
        ids.append(str(approval.pk))
    return PolicyResult(passed=True)


def consume_approvals(ids, *, tenant_id):
    """Only one concurrent execution can claim an approval; failed checks consume none."""
    if not ids:
        return True
    with transaction.atomic(using=router.db_for_write(ExecutionApproval)):
        approvals = list(ExecutionApproval.objects.select_for_update().filter(tenant_id=tenant_id, pk__in=ids))
        if len(approvals) != len(ids) or any(a.consumed_at or a.expires_at <= timezone.now() for a in approvals):
            return False
        ExecutionApproval.objects.filter(tenant_id=tenant_id, pk__in=ids).update(consumed_at=timezone.now())
    return True
