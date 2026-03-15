"""
Behavioral baseline evaluator.

Compares current request metrics against the agent's historical p95 baseline.
Catches data exfiltration, runaway loops, and compromised agents that are only
visible as deviations from normal behavior over time.

Baselines are maintained by the `update_agent_baselines` Celery beat task
and read from Redis on the hot evaluation path (read-only, no DB hit).
"""
import logging
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class BehavioralBaselineEvaluator(BasePolicyEvaluator):
    """
    Evaluates behavioral_baseline policies.

    Config schema:
    {
        "token_usage_deviation_threshold": 5.0,
        "tool_call_deviation_threshold": 10.0,
        "domain_deviation_threshold": 5.0,
        "requests_per_hour_deviation_threshold": 5.0,
        "min_samples_before_enforce": 50,
        "action_on_anomaly": "warn",         # "warn" | "block"
        "baseline_window_days": 14
    }

    Context keys:
        "tokens_used"          int   — token count for this call
        "tool_calls_this_session" int — tool calls so far in this session
        "domains_today"        int   — unique external domains contacted today
        "requests_this_hour"   int   — request count in the current hour
        "agent_id"             str   — agent identifier (for baseline lookup)

    Deviation thresholds: X means "N * p95_baseline triggers alert".
    e.g. threshold=5.0 and p95=100 → alert at 500+ tokens.
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
        dry_run: bool = False,
    ) -> PolicyResult:
        from zentinelle.services.behavioral_baseline import get_baseline

        config = policy.config
        warnings = []

        # Resolve agent identifier
        agent_id = context.get('agent_id', '')
        if not agent_id:
            # Can't evaluate without knowing which agent we're looking at
            return PolicyResult(passed=True, warnings=["BehavioralBaseline: no agent_id in context, skipping."])

        # Load baseline from Redis (no DB hit)
        endpoint = getattr(policy, '_endpoint', None)
        tenant_id = getattr(endpoint, 'tenant_id', '') if endpoint else context.get('tenant_id', '')

        baseline = get_baseline(tenant_id, agent_id)

        min_samples = config.get('min_samples_before_enforce', 50)

        if baseline is None or baseline.get('sample_count', 0) < min_samples:
            sample_count = baseline.get('sample_count', 0) if baseline else 0
            warnings.append(
                f"Behavioral baseline not yet established for agent '{agent_id}' "
                f"({sample_count}/{min_samples} samples). Anomaly detection inactive."
            )
            return PolicyResult(passed=True, warnings=warnings)

        action_on_anomaly = config.get('action_on_anomaly', 'warn')
        anomalies = []

        # ── Token usage ───────────────────────────────────────────────────────
        tokens_used = context.get('tokens_used')
        token_p95 = baseline.get('token_usage_p95', 0)
        token_threshold = config.get('token_usage_deviation_threshold', 5.0)
        if tokens_used and token_p95 > 0:
            ratio = tokens_used / token_p95
            if ratio > token_threshold:
                anomalies.append(
                    f"Token usage {tokens_used} is {ratio:.1f}x above p95 baseline "
                    f"({token_p95:.0f}). Threshold: {token_threshold}x."
                )

        # ── Tool calls per session ────────────────────────────────────────────
        tool_calls = context.get('tool_calls_this_session')
        tool_p95 = baseline.get('tool_calls_per_session_p95', 0)
        tool_threshold = config.get('tool_call_deviation_threshold', 10.0)
        if tool_calls and tool_p95 > 0:
            ratio = tool_calls / tool_p95
            if ratio > tool_threshold:
                anomalies.append(
                    f"Tool calls this session ({tool_calls}) is {ratio:.1f}x above "
                    f"p95 baseline ({tool_p95:.0f}). Threshold: {tool_threshold}x."
                )

        # ── Unique domains today ──────────────────────────────────────────────
        domains_today = context.get('domains_today')
        domain_p95 = baseline.get('unique_domains_per_day_p95', 0)
        domain_threshold = config.get('domain_deviation_threshold', 5.0)
        if domains_today and domain_p95 > 0:
            ratio = domains_today / domain_p95
            if ratio > domain_threshold:
                anomalies.append(
                    f"Unique domains contacted today ({domains_today}) is {ratio:.1f}x "
                    f"above p95 baseline ({domain_p95:.0f}). Threshold: {domain_threshold}x."
                )

        # ── Requests per hour ─────────────────────────────────────────────────
        requests_this_hour = context.get('requests_this_hour')
        rph_p95 = baseline.get('requests_per_hour_p95', 0)
        rph_threshold = config.get('requests_per_hour_deviation_threshold', 5.0)
        if requests_this_hour and rph_p95 > 0:
            ratio = requests_this_hour / rph_p95
            if ratio > rph_threshold:
                anomalies.append(
                    f"Requests this hour ({requests_this_hour}) is {ratio:.1f}x above "
                    f"p95 baseline ({rph_p95:.0f}). Threshold: {rph_threshold}x."
                )

        if not anomalies:
            return PolicyResult(passed=True, warnings=warnings)

        summary = f"Behavioral anomaly detected for agent '{agent_id}': " + "; ".join(anomalies)

        if action_on_anomaly == 'block' and not dry_run:
            return PolicyResult(passed=False, message=summary)

        # warn mode (or dry_run) — surface as warning, don't block
        warnings.append(f"[BehavioralAnomaly] {summary}")
        logger.warning(
            "Behavioral anomaly (policy=%s, agent=%s, action=%s): %s",
            policy.name, agent_id, action, summary,
        )
        return PolicyResult(passed=True, warnings=warnings)
