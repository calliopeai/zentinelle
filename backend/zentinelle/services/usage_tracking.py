"""
Usage tracking service for AI token usage and costs.
"""
import logging
from decimal import Decimal
from django.utils import timezone
from zentinelle.models.usage import UsageMetric

logger = logging.getLogger(__name__)

# Model pricing in USD per 1M tokens
# Source: frontend/src/components/zentinelle/PolicyOverheadDashboard.tsx
MODEL_PRICING = {
    'gpt-4o': {'input': 2.50, 'output': 10.00},
    'gpt-4o-mini': {'input': 0.15, 'output': 0.60},
    'gpt-4-turbo': {'input': 10.00, 'output': 30.00},
    'claude-3-5-sonnet-20240620': {'input': 3.00, 'output': 15.00},
    'claude-3-opus-20240229': {'input': 15.00, 'output': 75.00},
    'claude-3-haiku-20240307': {'input': 0.25, 'output': 1.25},
    'gemini-1.5-pro': {'input': 3.50, 'output': 10.50},
    'gemini-1.5-flash': {'input': 0.075, 'output': 0.30},
}

class UsageTrackingService:
    @staticmethod
    def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> tuple[Decimal, Decimal]:
        """Calculate estimated cost for a model and token counts."""
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            # Try fuzzy match for model versions
            for key, val in MODEL_PRICING.items():
                if key in model or model in key:
                    pricing = val
                    break
        
        if not pricing:
            return Decimal('0.0'), Decimal('0.0')
        
        input_cost = (Decimal(input_tokens) / Decimal('1000000')) * Decimal(str(pricing['input']))
        output_cost = (Decimal(output_tokens) / Decimal('1000000')) * Decimal(str(pricing['output']))
        
        return input_cost, output_cost

    @classmethod
    def record_usage(
        cls,
        tenant_id: str,
        user_identifier: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        request_id: str = '',
        endpoint=None,
        deployment_id_ext: str = '',
        occurred_at=None,
        metadata: dict = None
    ):
        """Record AI usage and calculate costs."""
        occurred_at = occurred_at or timezone.now()
        
        # Calculate costs if not provided
        input_cost, output_cost = cls.calculate_cost(model, input_tokens, output_tokens)
        
        # Combine into metadata for the UsageMetric record
        combined_metadata = metadata or {}
        combined_metadata.update({
            'calculated_input_cost': float(input_cost),
            'calculated_output_cost': float(output_cost),
            'total_estimated_cost': float(input_cost + output_cost),
        })

        return UsageMetric.record_ai_usage(
            organization=tenant_id,
            user_identifier=user_identifier,
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            request_id=request_id,
            endpoint=endpoint,
            deployment=deployment_id_ext,
            occurred_at=occurred_at,
            metadata=combined_metadata
        )
