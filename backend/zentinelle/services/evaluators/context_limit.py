"""
Context Limit Evaluator.
Enforces token limits on AI requests (input, output, total).
"""
from typing import Dict, Any, Optional

from zentinelle.models import Policy
from zentinelle.services.evaluators.base import BasePolicyEvaluator, PolicyResult


class ContextLimitEvaluator(BasePolicyEvaluator):
    """
    Evaluates context_limit policies.

    Config schema:
    {
        "max_input_tokens": 50000,
        "max_output_tokens": 4096,
        "max_total_tokens": 100000,
    }

    Context required:
    - "input_tokens": int   — token count of the input/prompt
    - "output_tokens": int  — (optional) requested or observed output token count
    - "total_tokens": int   — (optional) total tokens for the request
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

        input_tokens = context.get('input_tokens')
        output_tokens = context.get('output_tokens')
        total_tokens = context.get('total_tokens')

        # Check input token limit
        max_input = config.get('max_input_tokens')
        if max_input is not None and input_tokens is not None:
            if input_tokens > max_input:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Input token count ({input_tokens}) exceeds limit ({max_input})"
                    ),
                )
            if input_tokens >= max_input * 0.9:
                warnings.append(
                    f"Input tokens approaching limit: {input_tokens}/{max_input}"
                )

        # Check output token limit
        max_output = config.get('max_output_tokens')
        if max_output is not None and output_tokens is not None:
            if output_tokens > max_output:
                return PolicyResult(
                    passed=False,
                    message=(
                        f"Output token count ({output_tokens}) exceeds limit ({max_output})"
                    ),
                )
            if output_tokens >= max_output * 0.9:
                warnings.append(
                    f"Output tokens approaching limit: {output_tokens}/{max_output}"
                )

        # Check total token limit
        max_total = config.get('max_total_tokens')
        if max_total is not None:
            # Use explicit total_tokens if provided, otherwise sum input + output
            tokens_to_check = total_tokens
            if tokens_to_check is None and input_tokens is not None:
                tokens_to_check = input_tokens + (output_tokens or 0)

            if tokens_to_check is not None:
                if tokens_to_check > max_total:
                    return PolicyResult(
                        passed=False,
                        message=(
                            f"Total token count ({tokens_to_check}) exceeds limit ({max_total})"
                        ),
                    )
                if tokens_to_check >= max_total * 0.9:
                    warnings.append(
                        f"Total tokens approaching limit: {tokens_to_check}/{max_total}"
                    )

        return PolicyResult(passed=True, warnings=warnings)
