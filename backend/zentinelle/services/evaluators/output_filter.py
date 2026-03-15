"""
Output Filter Evaluator.
Enforces content filtering on agent output (PII, secrets, custom regex patterns).
"""
import re
import logging
from typing import Dict, Any, Optional, List

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)

# Severity ordering for comparison
SEVERITY_ORDER = {
    'low': 0,
    'medium': 1,
    'high': 2,
    'critical': 3,
}


class OutputFilterEvaluator(BasePolicyEvaluator):
    """
    Evaluates output_filter policies.

    Config schema:
    {
        "block_pii": true,
        "block_secrets": true,
        "max_severity": "medium",       # block if scan finds violations above this severity
        "blocked_patterns": [           # regex patterns to match against output_text
            "SSN:\\d{3}-\\d{2}-\\d{4}",
        ],
    }

    Context required:
    - "output_text": str  — (optional) raw output text to scan
    - "scan_result": dict — (optional) pre-computed scan result with violations list

    scan_result shape (when provided by caller):
    {
        "violations": [
            {"type": "pii", "severity": "high", "detail": "..."},
            {"type": "secret", "severity": "critical", "detail": "..."},
        ]
    }

    Note: Does not invoke ContentScanner directly (async). If output_text is
    provided without a scan_result, only blocked_patterns are checked via regex.
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        config = policy.config
        warnings = []

        scan_result = context.get('scan_result')
        output_text = context.get('output_text')

        # Path 1: pre-computed scan result provided — check violations against policy
        if scan_result is not None:
            result = self._evaluate_scan_result(config, scan_result)
            if not result.passed:
                return result
            warnings.extend(result.warnings)

        # Path 2: raw output text — check blocked_patterns via regex
        elif output_text is not None:
            result = self._evaluate_blocked_patterns(config, output_text)
            if not result.passed:
                return result
            warnings.extend(result.warnings)

        return PolicyResult(passed=True, warnings=warnings)

    def _evaluate_scan_result(
        self,
        config: Dict[str, Any],
        scan_result: Dict[str, Any],
    ) -> PolicyResult:
        """Check a pre-computed scan result against policy settings."""
        block_pii = config.get('block_pii', False)
        block_secrets = config.get('block_secrets', False)
        max_severity = config.get('max_severity')
        max_severity_level = SEVERITY_ORDER.get(max_severity, -1) if max_severity else -1

        violations: List[Dict[str, Any]] = scan_result.get('violations', [])
        warnings = []

        for violation in violations:
            vtype = violation.get('type', '')
            severity = violation.get('severity', 'low')
            detail = violation.get('detail', '')

            # Check PII violations
            if block_pii and vtype == 'pii':
                return PolicyResult(
                    passed=False,
                    message=f"Output blocked: PII detected ({detail})" if detail else "Output blocked: PII detected",
                )

            # Check secret violations
            if block_secrets and vtype == 'secret':
                return PolicyResult(
                    passed=False,
                    message=f"Output blocked: secret/credential detected ({detail})" if detail else "Output blocked: secret/credential detected",
                )

            # Check severity threshold
            if max_severity is not None:
                violation_level = SEVERITY_ORDER.get(severity, 0)
                if violation_level > max_severity_level:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Output blocked: violation severity '{severity}' exceeds "
                            f"maximum allowed severity '{max_severity}'"
                        ),
                    )

            # Warn on violations that don't breach policy but are present
            if severity in ('medium', 'high', 'critical'):
                warnings.append(
                    f"[OutputFilter] {severity.upper()} violation detected: {vtype}"
                    + (f" — {detail}" if detail else "")
                )

        return PolicyResult(passed=True, warnings=warnings)

    def _evaluate_blocked_patterns(
        self,
        config: Dict[str, Any],
        output_text: str,
    ) -> PolicyResult:
        """Check output text against configured regex patterns."""
        blocked_patterns = config.get('blocked_patterns', [])

        for raw_pattern in blocked_patterns:
            try:
                if re.search(raw_pattern, output_text):
                    return PolicyResult(
                        passed=False,
                        message=f"Output blocked: matched restricted pattern",
                    )
            except re.error as exc:
                logger.warning(
                    f"OutputFilterEvaluator: invalid regex pattern '{raw_pattern}': {exc}"
                )

        return PolicyResult(passed=True)
