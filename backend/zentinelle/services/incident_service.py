"""
Incident Service — helpers for auto-creating incidents from policy evaluations.

Kept separate from policy_engine.py to avoid circular imports and to keep the
engine focused on evaluation rather than side-effects.
"""
import logging
from typing import List, Dict, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from zentinelle.services.policy_engine import EvaluationResult
    from zentinelle.models import Policy

logger = logging.getLogger(__name__)


def _risk_score_to_severity(risk_score: int) -> str:
    """Map a numeric risk score to an incident severity string."""
    if risk_score >= 80:
        return 'critical'
    if risk_score >= 60:
        return 'high'
    if risk_score >= 40:
        return 'medium'
    return 'low'


def _maybe_create_incident(
    tenant_id: str,
    result: 'EvaluationResult',
    policies: List[Any],
) -> None:
    """
    Auto-create an Incident when a policy violation occurs and the policy
    has ``auto_incident: true`` in its config.

    Rules:
    - Skipped entirely when ``result.dry_run`` is True.
    - Only triggered for policies that appear in ``result.policies_evaluated``
      with ``result='fail'`` AND whose config contains ``auto_incident=True``.
    - Severity is derived from ``result.risk_score``.
    - A Celery notification task is queued after creation (best-effort).
    """
    if result.dry_run:
        return

    # Build a quick lookup from policy id → policy object
    policy_map: Dict[str, Any] = {str(p.id): p for p in policies}

    for evaluated in result.policies_evaluated:
        if evaluated.get('result') != 'fail':
            continue

        policy_id = evaluated.get('id')
        policy = policy_map.get(policy_id)
        if policy is None:
            continue

        if not policy.config.get('auto_incident', False):
            continue

        severity = _risk_score_to_severity(result.risk_score)

        try:
            from zentinelle.models import Incident

            incident = Incident.objects.create(
                tenant_id=tenant_id,
                title=f"Policy violation: {policy.name}",
                description=evaluated.get('message') or '',
                severity=severity,
                status=Incident.Status.OPEN,
                source=Incident.Source.POLICY_VIOLATION,
                source_ref=policy_id or '',
            )
            logger.info(
                "Auto-created incident %s for policy violation: %s (tenant=%s)",
                incident.id,
                policy.name,
                tenant_id,
            )

            # Create in-app notification
            try:
                from zentinelle.models.notification import create_notification, Notification
                create_notification(
                    tenant_id=tenant_id,
                    type=Notification.Type.INCIDENT_OPENED,
                    subject=f"Incident opened: {incident.title}",
                    message=f"Severity: {severity}. {evaluated.get('message') or ''}".strip(),
                    metadata={'incident_id': str(incident.id), 'severity': severity},
                )
            except Exception as exc:
                logger.warning("Failed to create incident notification: %s", exc)

            # Queue notification (best-effort)
            try:
                from zentinelle.tasks.notifications import send_incident_notification
                send_incident_notification.delay(incident.id)
            except Exception as exc:
                logger.warning("Failed to queue incident notification: %s", exc)

        except Exception as exc:
            logger.error(
                "Failed to auto-create incident for policy %s (tenant=%s): %s",
                policy_id,
                tenant_id,
                exc,
            )
