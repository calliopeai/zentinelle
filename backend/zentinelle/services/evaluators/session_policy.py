"""
Session policy evaluator.

Enforces session duration limits, message counts, idle timeouts,
and time-of-day access restrictions.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class SessionPolicyEvaluator(BasePolicyEvaluator):
    """
    Evaluates session_policy policies.

    Config schema:
    {
        "max_session_duration_minutes": 60,
        "max_messages_per_session": 200,
        "idle_timeout_minutes": 15,
        "allowed_hours": {"start": 8, "end": 18},
        "allowed_days": [0, 1, 2, 3, 4],
        "timezone": "UTC"
    }

    Context keys:
        "session_started_at"      — ISO8601 string or Unix timestamp
        "session_message_count"   — int, number of messages in session
        "session_last_active_at"  — ISO8601 string or Unix timestamp (for idle check)
        "session_id"              — session identifier (for logging)
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
        now = datetime.now(tz=timezone.utc)

        # 1. Time-of-day restriction
        allowed_hours = config.get('allowed_hours')
        if allowed_hours:
            start_hour = allowed_hours.get('start', 0)
            end_hour = allowed_hours.get('end', 24)
            current_hour = now.hour
            if not (start_hour <= current_hour < end_hour):
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Policy '{policy.name}' restricts access to hours "
                        f"{start_hour:02d}:00–{end_hour:02d}:00 UTC. "
                        f"Current time: {current_hour:02d}:{now.minute:02d} UTC."
                    ),
                )

        # 2. Day-of-week restriction (0=Monday, 6=Sunday)
        allowed_days = config.get('allowed_days')
        if allowed_days is not None:
            current_day = now.weekday()
            if current_day not in allowed_days:
                day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Policy '{policy.name}' does not permit access on "
                        f"{day_names[current_day]}. "
                        f"Allowed days: {[day_names[d] for d in allowed_days]}."
                    ),
                )

        # 3. Session duration limit
        max_duration = config.get('max_session_duration_minutes')
        session_started_raw = context.get('session_started_at')
        if max_duration and session_started_raw:
            session_started = self._parse_timestamp(session_started_raw)
            if session_started:
                elapsed_minutes = (now - session_started).total_seconds() / 60
                if elapsed_minutes > max_duration:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Session has exceeded the maximum duration of "
                            f"{max_duration} minutes (elapsed: {int(elapsed_minutes)} min). "
                            f"Please start a new session."
                        ),
                    )
                elif elapsed_minutes > max_duration * 0.9:
                    warnings.append(
                        f"Session approaching time limit: {int(elapsed_minutes)}/{max_duration} minutes elapsed."
                    )

        # 4. Max messages per session
        max_messages = config.get('max_messages_per_session')
        message_count = context.get('session_message_count', 0)
        if max_messages and message_count >= max_messages:
            return PolicyResult(
                passed=False,
                message=(
                    f"Session message limit of {max_messages} reached "
                    f"(count: {message_count}). Please start a new session."
                ),
            )
        if max_messages and message_count >= max_messages * 0.9:
            warnings.append(
                f"Approaching session message limit: {message_count}/{max_messages} messages."
            )

        # 5. Idle timeout
        idle_timeout = config.get('idle_timeout_minutes')
        last_active_raw = context.get('session_last_active_at')
        if idle_timeout and last_active_raw:
            last_active = self._parse_timestamp(last_active_raw)
            if last_active:
                idle_minutes = (now - last_active).total_seconds() / 60
                if idle_minutes > idle_timeout:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Session has been idle for {int(idle_minutes)} minutes, "
                            f"exceeding the idle timeout of {idle_timeout} minutes. "
                            "Please start a new session."
                        ),
                    )

        return PolicyResult(passed=True, warnings=warnings)

    def _parse_timestamp(self, value: Any) -> Optional[datetime]:
        """Parse an ISO8601 string or Unix timestamp to a UTC datetime."""
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(value, tz=timezone.utc)
            except (OSError, OverflowError, ValueError):
                return None
        if isinstance(value, str):
            try:
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value
        return None
