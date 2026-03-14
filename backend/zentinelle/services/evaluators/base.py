"""
Base policy evaluator interface.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

from zentinelle.models import Policy


@dataclass
class PolicyResult:
    """Result of evaluating a single policy."""
    passed: bool
    message: Optional[str] = None
    warnings: List[str] = field(default_factory=list)


class BasePolicyEvaluator(ABC):
    """
    Base class for policy evaluators.
    Each policy type has its own evaluator that knows how to interpret the config.
    """

    @abstractmethod
    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
    ) -> PolicyResult:
        """
        Evaluate a policy for a specific action and context.

        Args:
            policy: The policy to evaluate
            action: The action being performed (e.g., 'spawn', 'tool_call')
            user_id: The user performing the action (optional)
            context: Additional context for evaluation

        Returns:
            PolicyResult with passed status and optional message/warnings
        """
        pass


class NoOpEvaluator(BasePolicyEvaluator):
    """
    Evaluator that always passes.
    Used for policy types that don't block actions
    (e.g., system_prompt, audit_policy).
    """

    def evaluate(
        self,
        policy: Policy,
        action: str,
        user_id: Optional[str],
        context: Dict[str, Any],
    ) -> PolicyResult:
        return PolicyResult(passed=True)
