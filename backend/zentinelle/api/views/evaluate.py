"""
Policy evaluation endpoint.
POST /api/zentinelle/v1/evaluate
"""
import logging

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from zentinelle.models import AgentEndpoint, Event
from zentinelle.models.compliance import InteractionLog
from zentinelle.api.auth import ZentinelleAPIKeyAuthentication, get_endpoint_from_request
from zentinelle.api.serializers import EvaluateRequestSerializer

logger = logging.getLogger(__name__)


class EvaluateView(APIView):
    """
    Evaluate policies for an action.

    This is a synchronous endpoint - agents should use this
    before performing critical actions like spawning servers.
    """

    authentication_classes = [ZentinelleAPIKeyAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = EvaluateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Get authenticated endpoint
        auth_endpoint = get_endpoint_from_request(request)

        # Verify agent_id matches
        if auth_endpoint.agent_id != data['agent_id']:
            return Response(
                {'error': 'Agent ID mismatch'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Evaluate policies
        from zentinelle.services.policy_engine import PolicyEngine

        engine = PolicyEngine()
        result = engine.evaluate(
            endpoint=auth_endpoint,
            action=data['action'],
            user_id=data.get('user_id'),
            context=data.get('context', {}),
        )

        # Log evaluation (async) and interaction (for monitoring)
        self._log_evaluation(auth_endpoint, data, result)
        self._log_interaction(auth_endpoint, data, result)

        response_data = {
            'allowed': result.allowed,
            'reason': result.reason,
            'policies_evaluated': result.policies_evaluated,
            'warnings': result.warnings,
            'context': result.context,
        }

        return Response(response_data, status=status.HTTP_200_OK)

    def _log_evaluation(self, endpoint: AgentEndpoint, request_data: dict, result):
        """Log the policy evaluation as an audit event."""
        from zentinelle.tasks.events import process_event_batch
        from django.utils import timezone

        # Determine event type based on result
        if not result.allowed:
            event_type = Event.EventType.POLICY_VIOLATION
            event_category = Event.Category.ALERT
        else:
            event_type = f"policy_evaluation_{request_data['action']}"
            event_category = Event.Category.AUDIT

        event = Event.objects.create(
            tenant_id=endpoint.tenant_id,
            endpoint=endpoint,
            deployment_id_ext=endpoint.deployment_id_ext,
            event_type=event_type,
            event_category=event_category,
            user_identifier=request_data.get('user_id', ''),
            payload={
                'action': request_data['action'],
                'context': request_data.get('context', {}),
                'result': {
                    'allowed': result.allowed,
                    'reason': result.reason,
                    'policies_evaluated': result.policies_evaluated,
                },
            },
            occurred_at=timezone.now(),
            status=Event.Status.PENDING,
        )

        # Queue for processing (gracefully handle if queue unavailable)
        try:
            process_event_batch.apply_async(
                args=[[str(event.id)], event_category],
            )
        except Exception as e:
            logger.warning(f"Failed to queue evaluation event: {e}")

    def _log_interaction(self, endpoint: AgentEndpoint, request_data: dict, result):
        """Create an InteractionLog and record usage metrics."""
        from django.utils import timezone
        from zentinelle.services.usage_tracking import UsageTrackingService

        ctx = request_data.get('context', {})
        action = request_data['action']
        tool = ctx.get('tool', action)
        tool_input = ctx.get('tool_input', {})

        type_map = {
            'tool_call': InteractionLog.InteractionType.FUNCTION_CALL,
            'llm:invoke': InteractionLog.InteractionType.CHAT,
            'llm:response': InteractionLog.InteractionType.CHAT,
            'spawn': InteractionLog.InteractionType.FUNCTION_CALL,
        }
        interaction_type = type_map.get(action, InteractionLog.InteractionType.FUNCTION_CALL)

        provider_map = {
            'claude_code': 'anthropic',
            'codex': 'openai',
            'gemini': 'google',
        }
        provider = provider_map.get(endpoint.agent_type, ctx.get('source', ''))
        model = ctx.get('model', endpoint.agent_type)
        input_tokens = ctx.get('input_tokens', ctx.get('tokens', 0))
        output_tokens = ctx.get('output_tokens', 0)

        cost = None
        if model and (input_tokens or output_tokens):
            in_cost, out_cost = UsageTrackingService.calculate_cost(model, input_tokens, output_tokens)
            cost = float(in_cost + out_cost)

        try:
            InteractionLog.objects.create(
                tenant_id=endpoint.tenant_id,
                endpoint=endpoint,
                deployment_id_ext=endpoint.deployment_id_ext,
                user_identifier=request_data.get('user_id', ''),
                interaction_type=interaction_type,
                ai_provider=provider,
                ai_model=model,
                input_content=f"{tool}: {str(tool_input)[:200]}" if tool_input else tool,
                input_token_count=input_tokens or None,
                output_token_count=output_tokens or None,
                total_tokens=(input_tokens + output_tokens) or None,
                estimated_cost_usd=cost,
                tool_calls=[{'tool': tool, 'input': tool_input, 'status': 'allowed' if result.allowed else 'blocked'}],
                occurred_at=timezone.now(),
            )
        except Exception as e:
            logger.warning(f"Failed to log interaction: {e}")

        if input_tokens or output_tokens:
            try:
                UsageTrackingService.record_usage(
                    tenant_id=endpoint.tenant_id,
                    user_identifier=request_data.get('user_id', ''),
                    provider=provider,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    endpoint=endpoint,
                    deployment_id_ext=endpoint.deployment_id_ext,
                )
            except Exception as e:
                logger.warning(f"Failed to record usage: {e}")
