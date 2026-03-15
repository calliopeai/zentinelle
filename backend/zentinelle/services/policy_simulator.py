"""
Policy simulation service.

Replays historical Event records through a proposed policy config
to show impact before deployment.
"""
import logging
from datetime import timedelta
from typing import Optional

from django.utils import timezone

from zentinelle.models import Event, Policy
from zentinelle.services.policy_engine import PolicyEngine

logger = logging.getLogger(__name__)


def simulate_policy(
    tenant_id: str,
    policy_config: dict,
    lookback_days: int = 7,
    max_events: int = 1000,
) -> dict:
    """
    Dry-run a proposed policy config against historical events.

    Args:
        tenant_id: Tenant to scope the simulation to.
        policy_config: Dict with keys: policy_type, config, enforcement.
        lookback_days: How many days of history to replay.
        max_events: Cap on events to process.

    Returns:
        Dict with simulation results and impact summary.
    """
    policy_type = policy_config.get('policy_type', '')
    config = policy_config.get('config', {})
    enforcement = policy_config.get('enforcement', Policy.Enforcement.ENFORCE)

    since = timezone.now() - timedelta(days=lookback_days)

    events = list(
        Event.objects.filter(
            tenant_id=tenant_id,
            occurred_at__gte=since,
        ).order_by('-occurred_at')[:max_events]
    )

    total_events = len(events)
    would_block = 0
    would_warn = 0
    would_pass = 0
    blocked_samples = []

    # Build a minimal unsaved Policy object for the evaluator
    temp_policy = Policy(
        tenant_id=tenant_id,
        name='__simulation__',
        policy_type=policy_type,
        config=config,
        enforcement=enforcement,
        enabled=True,
        priority=0,
    )

    engine = PolicyEngine()
    evaluator = engine._get_evaluator(policy_type)

    for event in events:
        # Build context from event fields
        context = {}
        if isinstance(event.payload, dict):
            context.update(event.payload)

        # Event model has no separate metadata field — look for nested 'metadata'
        # key inside payload (agents may embed it there).
        nested_metadata = context.pop('metadata', {})
        if not isinstance(nested_metadata, dict):
            nested_metadata = {}

        if 'tokens_used' in nested_metadata:
            context['tokens_used'] = nested_metadata['tokens_used']
        if 'model' in nested_metadata:
            context['model'] = nested_metadata['model']
        if 'action' in nested_metadata:
            context['action'] = nested_metadata['action']

        # Fall back to event_type as action
        context.setdefault('action', event.event_type)

        try:
            result = evaluator.evaluate(
                temp_policy,
                event.event_type,
                user_id=event.user_identifier or None,
                context=context,
                dry_run=True,
            )

            if not result.passed:
                if enforcement == Policy.Enforcement.ENFORCE:
                    would_block += 1
                    if len(blocked_samples) < 20:
                        blocked_samples.append({
                            'event_id': str(event.id),
                            'action': event.event_type,
                            'reason': result.message or 'Policy violation',
                        })
                else:
                    would_warn += 1
            else:
                would_pass += 1

        except Exception as exc:  # noqa: BLE001
            logger.warning(
                'Policy simulator: evaluator raised for event %s (%s): %s',
                event.id,
                policy_type,
                exc,
            )
            would_pass += 1

    impact_percent = round((would_block / total_events) * 100, 2) if total_events > 0 else 0.0

    return {
        'total_events': total_events,
        'would_block': would_block,
        'would_warn': would_warn,
        'would_pass': would_pass,
        'impact_percent': impact_percent,
        'blocked_samples': blocked_samples,
        'simulated_policy_type': policy_type,
        'lookback_days': lookback_days,
    }


def detect_policy_conflicts(tenant_id: str, proposed_policy_config: dict) -> list:
    """
    Detect conflicts between a proposed policy and existing enabled policies.

    Args:
        tenant_id: Tenant scope.
        proposed_policy_config: Dict with keys: policy_type, config, enforcement,
            and optionally priority.

    Returns:
        List of conflict dicts: {policy_id, policy_name, conflict_type, detail}.
    """
    proposed_type = proposed_policy_config.get('policy_type', '')
    proposed_config = proposed_policy_config.get('config', {})
    proposed_priority = proposed_policy_config.get('priority', 0)

    existing_policies = Policy.objects.filter(
        tenant_id=tenant_id,
        policy_type=proposed_type,
        enabled=True,
    )

    conflicts = []

    for policy in existing_policies:
        existing_config = policy.config or {}
        conflict_type = None
        detail = ''

        # Check allowed_models vs blocked_models contradiction
        proposed_allowed = set(proposed_config.get('allowed_models', []))
        proposed_blocked = set(proposed_config.get('blocked_models', []))
        existing_allowed = set(existing_config.get('allowed_models', []))
        existing_blocked = set(existing_config.get('blocked_models', []))

        # A model in proposed allowed_models that is in existing blocked_models
        cross_ab = proposed_allowed & existing_blocked
        # A model in proposed blocked_models that is in existing allowed_models
        cross_ba = proposed_blocked & existing_allowed

        if cross_ab or cross_ba:
            conflict_type = 'contradiction'
            conflicting_models = cross_ab | cross_ba
            detail = (
                f"Models {', '.join(sorted(conflicting_models))} appear in both "
                f"allowed_models of one policy and blocked_models of the other."
            )

        # Check if existing policy has higher priority and same type — shadowing
        if conflict_type is None and policy.priority > proposed_priority:
            conflict_type = 'shadowed'
            detail = (
                f"Existing policy '{policy.name}' has higher priority ({policy.priority}) "
                f"than proposed ({proposed_priority}) and will always evaluate first for "
                f"policy type '{proposed_type}'."
            )

        if conflict_type:
            conflicts.append({
                'policy_id': str(policy.id),
                'policy_name': policy.name,
                'conflict_type': conflict_type,
                'detail': detail,
            })

    return conflicts
