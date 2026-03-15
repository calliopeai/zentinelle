"""
Data access policy evaluator.

Controls which data sources and data types an agent may access,
including PII access restrictions.
"""
import fnmatch
import logging
from typing import Dict, Any, Optional, List

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)


class DataAccessEvaluator(BasePolicyEvaluator):
    """
    Evaluates data_access policies.

    Config schema:
    {
        "allowed_datasources": ["postgres:public.*", "s3:data-lake/*"],
        "blocked_datasources": ["postgres:internal.users", "s3:secrets-*"],
        "allowed_data_types": ["structured", "documents"],
        "blocked_data_types": ["pii", "financial"],
        "pii_allowed": false,
        "require_encryption": true
    }

    Context keys:
        "datasource"       — identifier of the data source being accessed
                             (e.g. "postgres:public.events")
        "data_type"        — type of data (e.g. "pii", "structured", "documents")
        "data_contains_pii"— bool, whether the data contains PII
        "data_encrypted"   — bool, whether the data is encrypted at rest

    Evaluation order:
    1. Blocked datasources → deny
    2. Allowed datasources (if set) → deny if not matched
    3. Blocked data types → deny
    4. Allowed data types (if set) → deny if not matched
    5. PII access check
    6. Encryption requirement
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

        datasource = context.get('datasource', '')
        data_type = context.get('data_type', '')

        # 1. Blocked datasources
        blocked_datasources: List[str] = config.get('blocked_datasources', [])
        if datasource:
            for pattern in blocked_datasources:
                if fnmatch.fnmatch(datasource, pattern):
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Access to datasource '{datasource}' is blocked "
                            f"by pattern '{pattern}' in policy '{policy.name}'."
                        ),
                    )

        # 2. Allowed datasources allowlist
        allowed_datasources: List[str] = config.get('allowed_datasources', [])
        if allowed_datasources and datasource:
            matched = any(
                fnmatch.fnmatch(datasource, pattern)
                for pattern in allowed_datasources
            )
            if not matched:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Datasource '{datasource}' is not in the allowed list "
                        f"for policy '{policy.name}'. "
                        f"Allowed patterns: {', '.join(allowed_datasources)}"
                    ),
                )

        # 3. Blocked data types
        blocked_data_types: List[str] = config.get('blocked_data_types', [])
        if data_type and data_type in blocked_data_types:
            return PolicyResult(
                passed=False,
                message=(
                    f"Data type '{data_type}' is blocked by policy '{policy.name}'."
                ),
            )

        # 4. Allowed data types allowlist
        allowed_data_types: List[str] = config.get('allowed_data_types', [])
        if allowed_data_types and data_type:
            if data_type not in allowed_data_types:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Data type '{data_type}' is not permitted by policy '{policy.name}'. "
                        f"Allowed types: {', '.join(allowed_data_types)}"
                    ),
                )

        # 5. PII access control
        pii_allowed = config.get('pii_allowed', True)
        data_contains_pii = context.get('data_contains_pii', False)
        if not pii_allowed and data_contains_pii:
            return PolicyResult(
                passed=False,
                message=(
                    f"Policy '{policy.name}' does not permit access to PII-containing data."
                ),
            )
        if data_contains_pii and pii_allowed:
            warnings.append(
                "Accessing PII-containing data. Ensure compliance with applicable data regulations."
            )

        # 6. Encryption requirement
        require_encryption = config.get('require_encryption', False)
        data_encrypted = context.get('data_encrypted')
        if require_encryption and data_encrypted is False:
            return PolicyResult(
                passed=False,
                message=(
                    f"Policy '{policy.name}' requires encrypted data at rest, "
                    "but the target datasource is not encrypted."
                ),
            )

        return PolicyResult(passed=True, warnings=warnings)
