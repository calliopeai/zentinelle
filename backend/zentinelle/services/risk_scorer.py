"""
Risk scorer — computes a composite 0-100 risk score from evaluation signals.
"""
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)

# Action riskiness map (max 25 points)
ACTION_RISK_MAP = {
    'tool:shell_execute': 22,
    'tool:code_execute': 22,
    'tool:file_write': 18,
    'tool:file_delete': 18,
    'tool:database_write': 15,
    'tool:network_request': 12,
    'tool:file_read': 8,
    'llm:invoke': 5,
}

ACTION_RISK_DEFAULT = 3
ACTION_RISK_MAX = 25


class RiskScorer:
    """
    Computes a composite 0–100 risk score from evaluation signals.

    Score composition:
    - Policy violations:  max 35
    - Action riskiness:   max 25
    - Data sensitivity:   max 25
    - Behavioral signals: max 15
    """

    def compute(
        self,
        action: str,
        context: Dict[str, Any],
        policies_evaluated_results: List[Dict],
        warnings: List[str],
    ) -> Tuple[int, List[Dict]]:
        """
        Compute the risk score.

        Args:
            action: The action being performed (e.g., 'tool:shell_execute')
            context: Evaluation context dict
            policies_evaluated_results: List of policy result dicts from the engine
            warnings: List of warning strings collected during evaluation

        Returns:
            Tuple of (score: int, factors: list[dict])
        """
        factors: List[Dict] = []
        total = 0

        # --- Policy violations (max 35) ---
        violation_score, violation_factors = self._score_policy_violations(
            policies_evaluated_results
        )
        total += violation_score
        factors.extend(violation_factors)

        # --- Action riskiness (max 25) ---
        action_score, action_factors = self._score_action(action)
        total += action_score
        factors.extend(action_factors)

        # --- Data sensitivity (max 25) ---
        sensitivity_score, sensitivity_factors = self._score_data_sensitivity(context)
        total += sensitivity_score
        factors.extend(sensitivity_factors)

        # --- Behavioral signals (max 15) ---
        behavioral_score, behavioral_factors = self._score_behavioral_signals(warnings)
        total += behavioral_score
        factors.extend(behavioral_factors)

        # Cap at 100
        final_score = min(total, 100)
        return final_score, factors

    # ------------------------------------------------------------------
    # Internal scorers
    # ------------------------------------------------------------------

    def _score_policy_violations(
        self, results: List[Dict]
    ) -> Tuple[int, List[Dict]]:
        """Score based on policy violations. Max 35."""
        score = 0
        factors: List[Dict] = []

        enforcing_failures = 0
        audit_flags = 0

        for r in results:
            if r.get('result') == 'fail':
                policy_type = r.get('type', '')
                # Distinguish enforce vs audit by checking if it was a blocking fail.
                # The engine stores enforcement mode in the result dict only when
                # it's an audit failure (the engine adds [Audit] warning but still
                # records 'fail'). We use a heuristic: if a matching [Audit] warning
                # was emitted for this policy we count it as audit, otherwise enforce.
                # For scoring purposes we treat all 'fail' results without an
                # [Audit] prefix as enforcing failures.
                name = r.get('name', policy_type)
                # We can't directly access enforcement mode from the result dict,
                # so we use the 'enforcement' key if present (may be added in future),
                # otherwise assume enforce for conservative scoring.
                enforcement = r.get('enforcement', 'enforce')
                if enforcement == 'audit':
                    audit_flags += 1
                    factors.append({
                        'factor': 'policy_audit_flag',
                        'score': 3,
                        'detail': f'Audit policy flagged: {name}',
                    })
                    score += 3
                else:
                    enforcing_failures += 1
                    factors.append({
                        'factor': 'policy_violation',
                        'score': 7,
                        'detail': f'Enforcing policy failed: {name}',
                    })
                    score += 7

        capped = min(score, 35)
        if score > capped:
            # Adjust the last factor to reflect capping
            pass
        return capped, factors

    def _score_action(self, action: str) -> Tuple[int, List[Dict]]:
        """Score based on action riskiness. Max 25."""
        raw = ACTION_RISK_MAP.get(action, ACTION_RISK_DEFAULT)
        score = min(raw, ACTION_RISK_MAX)
        factors = [{
            'factor': 'action_riskiness',
            'score': score,
            'detail': f'Action "{action}" base risk score',
        }]
        return score, factors

    def _score_data_sensitivity(
        self, context: Dict[str, Any]
    ) -> Tuple[int, List[Dict]]:
        """Score based on data sensitivity signals. Max 25."""
        score = 0
        factors: List[Dict] = []

        if context.get('data_contains_pii') is True:
            factors.append({
                'factor': 'data_contains_pii',
                'score': 15,
                'detail': 'Context signals PII data present',
            })
            score += 15

        if context.get('is_pii_access') is True:
            factors.append({
                'factor': 'is_pii_access',
                'score': 15,
                'detail': 'Action is a PII access operation',
            })
            score += 15

        data_type = context.get('data_type', '')
        if data_type == 'financial':
            factors.append({
                'factor': 'data_type_financial',
                'score': 12,
                'detail': 'Data type is financial',
            })
            score += 12
        elif data_type == 'pii':
            factors.append({
                'factor': 'data_type_pii',
                'score': 15,
                'detail': 'Data type explicitly marked as PII',
            })
            score += 15

        datasource = context.get('datasource', '')
        if isinstance(datasource, str) and (
            'prod' in datasource.lower() or 'production' in datasource.lower()
        ):
            factors.append({
                'factor': 'production_datasource',
                'score': 10,
                'detail': f'Datasource "{datasource}" appears to be production',
            })
            score += 10

        if context.get('require_encryption') is False and (
            context.get('data_contains_pii')
            or context.get('is_pii_access')
            or data_type in ('pii', 'financial')
        ):
            factors.append({
                'factor': 'no_encryption_sensitive',
                'score': 8,
                'detail': 'Encryption not required on sensitive data',
            })
            score += 8

        capped = min(score, 25)
        return capped, factors

    def _score_behavioral_signals(
        self, warnings: List[str]
    ) -> Tuple[int, List[Dict]]:
        """Score based on behavioral signals in warnings. Max 15."""
        score = 0
        factors: List[Dict] = []

        for w in warnings:
            if w.startswith('[BehavioralAnomaly]'):
                factors.append({
                    'factor': 'behavioral_anomaly',
                    'score': 15,
                    'detail': w,
                })
                score += 15
                break  # one anomaly already maxes this sub-category

        if score < 15:
            audit_count = sum(1 for w in warnings if w.startswith('[Audit]'))
            if audit_count > 0:
                per_audit = min(audit_count * 3, 15 - score)
                factors.append({
                    'factor': 'audit_warnings',
                    'score': per_audit,
                    'detail': f'{audit_count} audit warning(s) recorded',
                })
                score += per_audit

        if score < 15:
            dry_run_denials = sum(
                1 for w in warnings if w.startswith('[Dry-run] Would be denied')
            )
            if dry_run_denials > 0:
                per_denial = min(dry_run_denials * 5, 15 - score)
                factors.append({
                    'factor': 'dry_run_denials',
                    'score': per_denial,
                    'detail': f'{dry_run_denials} action(s) would be denied',
                })
                score += per_denial

        return min(score, 15), factors
