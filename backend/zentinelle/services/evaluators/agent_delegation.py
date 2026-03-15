"""
Agent delegation chain evaluator.

Enforces trust boundaries when one agent spawns or delegates to another.
Prevents permission escalation, trust spoofing, and recursive spawn attacks.

This is the enforcement side of multi-agent trust (issue #21).
Tokens are issued via: zentinelle.utils.delegation_tokens.issue_delegation_token()
"""
import logging
from typing import Dict, Any, Optional, List

from django.core import signing

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult

logger = logging.getLogger(__name__)

# Delegation token validity: 1 hour (shorter than capability approvals)
DELEGATION_TOKEN_MAX_AGE = 60 * 60

SIGNING_SALT = 'agent-delegation-v1'

# Trust level ordering — each hop can only go down, never up
TRUST_LEVELS = ['restricted', 'standard', 'trusted', 'root']


class AgentDelegationEvaluator(BasePolicyEvaluator):
    """
    Evaluates agent_delegation policies.

    Config schema:
    {
        "max_delegation_depth": 3,
        "require_signed_delegation_token": true,
        "child_cannot_exceed_parent_trust": true,
        "allowed_parent_agents": [],        # [] = any parent allowed
        "blocked_parent_agents": [],
        "trust_level_degradation": 1,       # trust drops N levels per hop
        "min_trust_level": "restricted"     # deny if effective trust < this
    }

    Context keys:
        "parent_agent_id"        str   — agent_id of the spawning agent
        "delegation_depth"       int   — hops from the root agent (0 = root)
        "delegation_chain"       list  — list of agent_ids from root to parent
        "delegation_token"       str   — signed token issued by parent
        "parent_trust_level"     str   — trust level of the parent agent
        "requested_trust_level"  str   — trust level the child is claiming
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

        parent_agent_id = context.get('parent_agent_id')
        delegation_depth = context.get('delegation_depth', 0)
        delegation_chain: List[str] = context.get('delegation_chain', [])
        parent_trust_level = context.get('parent_trust_level', 'standard')
        requested_trust_level = context.get('requested_trust_level', 'standard')

        # 1. Max delegation depth
        max_depth = config.get('max_delegation_depth', 3)
        if delegation_depth > max_depth:
            return PolicyResult(
                passed=False,
                message=(
                    f"Delegation depth {delegation_depth} exceeds maximum of "
                    f"{max_depth} allowed by policy '{policy.name}'. "
                    "Agent spawn chain is too deep."
                ),
            )

        # 2. Blocked parent agents
        blocked_parents = config.get('blocked_parent_agents', [])
        if parent_agent_id and parent_agent_id in blocked_parents:
            return PolicyResult(
                passed=False,
                message=(
                    f"Parent agent '{parent_agent_id}' is blocked from delegating "
                    f"under policy '{policy.name}'."
                ),
            )

        # 3. Allowed parent agents allowlist
        allowed_parents = config.get('allowed_parent_agents', [])
        if allowed_parents and parent_agent_id:
            if parent_agent_id not in allowed_parents:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Parent agent '{parent_agent_id}' is not in the allowed "
                        f"delegator list for policy '{policy.name}'."
                    ),
                )

        # 4. Circular delegation detection
        if parent_agent_id and parent_agent_id in delegation_chain:
            return PolicyResult(
                passed=False,
                message=(
                    f"Circular delegation detected: agent '{parent_agent_id}' "
                    "already appears in the delegation chain."
                ),
            )

        # 5. Trust level — child cannot exceed parent
        if config.get('child_cannot_exceed_parent_trust', True):
            parent_idx = TRUST_LEVELS.index(parent_trust_level) if parent_trust_level in TRUST_LEVELS else 1
            requested_idx = TRUST_LEVELS.index(requested_trust_level) if requested_trust_level in TRUST_LEVELS else 1
            if requested_idx > parent_idx:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Child agent cannot claim trust level '{requested_trust_level}' — "
                        f"parent trust level is '{parent_trust_level}'. "
                        "Trust cannot be elevated through delegation."
                    ),
                )

        # 6. Trust level degradation
        degradation = config.get('trust_level_degradation', 0)
        if degradation and parent_trust_level in TRUST_LEVELS:
            parent_idx = TRUST_LEVELS.index(parent_trust_level)
            effective_idx = max(0, parent_idx - degradation)
            effective_trust = TRUST_LEVELS[effective_idx]

            min_trust = config.get('min_trust_level', 'restricted')
            min_idx = TRUST_LEVELS.index(min_trust) if min_trust in TRUST_LEVELS else 0
            if effective_idx < min_idx:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Effective trust level after {delegation_depth} delegation hop(s) "
                        f"is '{effective_trust}', below minimum required '{min_trust}' "
                        f"for policy '{policy.name}'."
                    ),
                )
            if effective_trust != requested_trust_level:
                warnings.append(
                    f"Effective trust level is '{effective_trust}' after degradation "
                    f"(requested '{requested_trust_level}')."
                )

        # 7. Signed delegation token validation
        if config.get('require_signed_delegation_token', False) and parent_agent_id:
            token = context.get('delegation_token')
            if not token:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Policy '{policy.name}' requires a signed delegation token "
                        "from the parent agent. No token provided."
                    ),
                )
            result = self._validate_delegation_token(
                token=token,
                parent_agent_id=parent_agent_id,
                delegation_depth=delegation_depth,
                policy_id=str(policy.id),
            )
            if not result.passed:
                return result

        if delegation_depth > 0:
            warnings.append(
                f"Delegated agent operating at depth {delegation_depth} "
                f"(chain length: {len(delegation_chain)})."
            )

        return PolicyResult(passed=True, warnings=warnings)

    def _validate_delegation_token(
        self,
        token: str,
        parent_agent_id: str,
        delegation_depth: int,
        policy_id: str,
    ) -> PolicyResult:
        """
        Validate a delegation token signed by the parent agent.

        Expected payload:
        {
            "parent_agent_id": "agent:uuid",
            "max_depth": 3,
            "policy": "policy_uuid",          # optional
            "granted_capabilities": ["..."],   # optional
        }
        """
        try:
            payload = signing.loads(
                token,
                salt=SIGNING_SALT,
                max_age=DELEGATION_TOKEN_MAX_AGE,
            )

            if payload.get('parent_agent_id') != parent_agent_id:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Delegation token was issued by '{payload.get('parent_agent_id')}', "
                        f"not '{parent_agent_id}'."
                    ),
                )

            token_max_depth = payload.get('max_depth')
            if token_max_depth is not None and delegation_depth > token_max_depth:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Delegation depth {delegation_depth} exceeds the token's "
                        f"authorized max depth of {token_max_depth}."
                    ),
                )

            if 'policy' in payload and payload['policy'] != policy_id:
                return PolicyResult(
                    passed=False,
                    message="Delegation token was issued for a different policy.",
                )

            logger.info(
                "Delegation token validated: parent=%s depth=%d",
                parent_agent_id,
                delegation_depth,
            )
            return PolicyResult(passed=True)

        except signing.SignatureExpired:
            return PolicyResult(
                passed=False,
                message="Delegation token has expired. Parent must issue a new token.",
            )
        except signing.BadSignature:
            return PolicyResult(
                passed=False,
                message="Delegation token signature is invalid.",
            )
        except Exception as exc:
            logger.error("Error validating delegation token: %s", exc)
            return PolicyResult(
                passed=False,
                message="Failed to validate delegation token.",
            )
