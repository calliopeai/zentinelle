"""
Data retention policy evaluator.

Validates that data retention metadata is present and consistent with
policy configuration. Surfaces warnings about upcoming retention windows.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class DataRetentionEvaluator(BasePolicyEvaluator):
    """
    Evaluates data_retention policies.

    Config schema:
    {
        "retention_days": 90,
        "anonymize_after_days": 30,
        "require_retention_metadata": true,
        "purge_on_request": true,
        "allowed_regions": ["us-east-1", "eu-west-1"]
    }

    Context keys:
        "data_created_at"         — ISO8601 or Unix timestamp of data creation
        "data_region"             — storage region of the data
        "retention_metadata"      — dict with any retention metadata tags
        "data_anonymized"         — bool, whether data has been anonymized
        "data_age_days"           — int, age of the data in days (alternative to data_created_at)

    Checks:
    1. If require_retention_metadata is true, validate metadata present.
    2. Enforce allowed_regions.
    3. Warn (or deny) if data exceeds retention_days.
    4. Warn if anonymize_after_days threshold is approaching.
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

        # 1. Required retention metadata
        require_metadata = config.get('require_retention_metadata', False)
        if require_metadata:
            metadata = context.get('retention_metadata')
            if not metadata:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Policy '{policy.name}' requires retention metadata to be "
                        "present in the request context."
                    ),
                )

        # 2. Region restriction
        allowed_regions = config.get('allowed_regions', [])
        data_region = context.get('data_region', '')
        if allowed_regions and data_region:
            if data_region not in allowed_regions:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Data stored in region '{data_region}' is not permitted "
                        f"by policy '{policy.name}'. "
                        f"Allowed regions: {', '.join(allowed_regions)}"
                    ),
                )

        # Resolve data age
        data_age_days = context.get('data_age_days')
        if data_age_days is None:
            created_raw = context.get('data_created_at')
            if created_raw:
                created_at = self._parse_timestamp(created_raw)
                if created_at:
                    data_age_days = (now - created_at).days

        # 3. Retention period enforcement
        retention_days = config.get('retention_days')
        if retention_days and data_age_days is not None:
            if data_age_days > retention_days:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Data is {data_age_days} days old, exceeding the retention "
                        f"period of {retention_days} days — policy '{policy.name}'. "
                        "Data must be deleted or anonymized before further processing."
                    ),
                )
            elif data_age_days > retention_days * 0.9:
                days_remaining = retention_days - data_age_days
                warnings.append(
                    f"Data retention period expires in {days_remaining} day(s) "
                    f"(policy '{policy.name}'). Schedule deletion or anonymization."
                )

        # 4. Anonymization window warning
        anonymize_after = config.get('anonymize_after_days')
        if anonymize_after and data_age_days is not None:
            data_anonymized = context.get('data_anonymized', False)
            if data_age_days > anonymize_after and not data_anonymized:
                warnings.append(
                    f"Data is {data_age_days} days old and should have been anonymized "
                    f"after {anonymize_after} days per policy '{policy.name}'."
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
