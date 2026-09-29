"""Bind approval to identity, semantic arguments and current policy versions."""
import hashlib
import json
from datetime import timedelta

from django.core import signing
from django.db import router, transaction
from django.utils import timezone

from zentinelle.models.approval import ApprovalRequest, ExecutionApproval
from zentinelle.services.evaluators.base import PolicyResult

SALT = 'zentinelle-execution-approval-v1'


def context_digest(context):
    # trace_id is minted per /evaluate call; binding it would make every
    # approval miss the retry that presents it.
    excluded = {'approval_token', 'request_id', 'trace_id'}
    canonical = {k: v for k, v in context.items() if not k.startswith('_') and k not in excluded}
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def grant_approval(*, tenant_id, kind, subject, action, digest, endpoint_id='',
                   policies=(), granted_by='', timeout=300):
    if not tenant_id or kind not in ('policy', 'assistant'):
        raise ValueError('A tenant and recognized approval kind are required')
    if kind == 'policy' and (not endpoint_id or not granted_by):
        raise ValueError('Policy approvals require a workload and human approver')
    if any(p.tenant_id != tenant_id for p in policies):
        raise ValueError('Approval policies must belong to the tenant')
    return ExecutionApproval.objects.create(
        tenant_id=tenant_id, kind=kind, subject=str(subject or ''), action=action,
        context_digest=digest, endpoint_id_ext=str(endpoint_id),
        policy_versions={str(p.id): p.version for p in policies}, granted_by=str(granted_by),
        expires_at=timezone.now() + timedelta(seconds=max(1, min(int(timeout), 300))),
    )


def sign_approval(approval_id):
    return signing.dumps(str(approval_id), salt=SALT)


def issue_approval(*, tenant_id, kind, subject, action, context, endpoint_id='',
                   policies=(), granted_by='', timeout=300):
    approval = grant_approval(
        tenant_id=tenant_id, kind=kind, subject=subject, action=action,
        digest=context_digest(context), endpoint_id=endpoint_id, policies=policies,
        granted_by=granted_by, timeout=timeout,
    )
    return sign_approval(approval.pk)


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


def approval_timeout(policies):
    """The shortest approval window any effective policy allows, at most five minutes."""
    return max(1, min([300] + [int(p.config.get('approval_timeout_seconds', 300)) for p in policies]))


def open_approval_request(*, endpoint, action, user_id, result, trace_id):
    """Hold an evaluated action whose only blocker is a missing approval.

    The request keeps the digest the engine computed for this evaluation, so
    an approval granted from it matches the workload's retry of the same call
    and nothing else. Returns the request and its window in seconds.
    """
    from zentinelle.services.policy_engine import PolicyEngine
    timeout = approval_timeout(PolicyEngine().get_effective_policies(endpoint, user_id))
    held = ApprovalRequest.objects.create(
        tenant_id=endpoint.tenant_id, endpoint_id_ext=str(endpoint.pk), subject=str(user_id or ''),
        action=action, context_digest=result.context['_approval_digest'], context=result.context,
        reason=result.reason or '', trace_id=trace_id,
        expires_at=timezone.now() + timedelta(seconds=timeout),
    )
    return held, timeout


def decide_approval_request(*, tenant_id, request_id, approve, decided_by, reason=''):
    """Record the one operator decision a pending request can take.

    Approving grants the held action as an ordinary single-use approval against
    the workload's current effective policies. Raises DoesNotExist outside the
    tenant and ValueError once the request is decided or expired.
    """
    from zentinelle.models import AgentEndpoint
    from zentinelle.services.policy_engine import PolicyEngine
    with transaction.atomic(using=router.db_for_write(ApprovalRequest)):
        held = ApprovalRequest.objects.select_for_update().get(tenant_id=tenant_id, pk=request_id)
        if held.current_status() != ApprovalRequest.Status.PENDING:
            raise ValueError(f'Approval request is {held.current_status()}, not pending')
        if approve:
            endpoint = AgentEndpoint.objects.filter(tenant_id=tenant_id, pk=held.endpoint_id_ext).first()
            if endpoint is None:
                raise ValueError('The requesting agent no longer exists')
            policies = PolicyEngine().get_effective_policies(endpoint, held.subject or None, use_cache=False)
            held.approval = grant_approval(
                tenant_id=tenant_id, kind='policy', subject=held.subject, action=held.action,
                digest=held.context_digest, endpoint_id=endpoint.pk, policies=policies,
                granted_by=decided_by, timeout=approval_timeout(policies),
            )
        held.status = ApprovalRequest.Status.APPROVED if approve else ApprovalRequest.Status.DENIED
        held.decided_by = str(decided_by)
        held.decided_at = timezone.now()
        held.decision_reason = reason
        held.save()
    return held
