"""
AI Assistant chat endpoint.

POST /api/zentinelle/v1/assistant/chat

Streams an AI assistant response with GRC context injected into
the system prompt. The assistant knows about the tenant's agents,
policies, and recent events so it can answer governance questions
in context.

Uses SSE (Server-Sent Events) for streaming.
"""
import asyncio
import json
import logging
import os

from django.http import JsonResponse, StreamingHttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name='dispatch')
class AssistantChatView(APIView):
    """Stream a GRC-aware AI assistant response."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        message = data.get('message', '')
        history = data.get('history', [])
        page_context = data.get('page_context', '')
        model = data.get('model', '')
        provider = data.get('provider', '')

        if not message:
            return JsonResponse(
                {'error': 'Message is required'}, status=400
            )

        system_prompt = self._build_system_prompt(request, page_context)

        messages = []
        for msg in history:
            messages.append({
                'role': msg.get('role', 'user'),
                'content': msg.get('content', ''),
            })
        messages.append({'role': 'user', 'content': message})

        if not model:
            model = os.environ.get(
                'ASSISTANT_MODEL', 'claude-sonnet-4-20250514'
            )

        response = StreamingHttpResponse(
            self._stream_response(messages, model, provider, system_prompt),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    def _stream_response(self, messages, model, provider, system_prompt):
        """Sync generator bridging async stream_chat into SSE."""
        from zentinelle.services.llm_provider import (detect_provider,
                                                      stream_chat)

        if not provider:
            provider = detect_provider(model)

        loop = asyncio.new_event_loop()

        async def collect():
            chunks = []
            async for chunk in stream_chat(
                messages, model, provider,
                system_prompt=system_prompt,
            ):
                chunks.append(chunk)
            return chunks

        try:
            chunks = loop.run_until_complete(collect())
            for chunk in chunks:
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Assistant chat stream error")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            loop.close()

    def _build_system_prompt(self, request, page_context):
        """Build a system prompt enriched with the tenant's GRC context."""
        from zentinelle.models import AgentEndpoint, Event, Policy
        from zentinelle.schema.auth_helpers import get_request_tenant_id

        tenant_id = get_request_tenant_id(request.user) or 'default'

        agent_count = AgentEndpoint.objects.filter(
            tenant_id=tenant_id
        ).count()
        healthy_count = AgentEndpoint.objects.filter(
            tenant_id=tenant_id, health='healthy'
        ).count()
        policy_count = Policy.objects.filter(
            tenant_id=tenant_id, enabled=True
        ).count()

        recent_events = list(
            Event.objects.filter(tenant_id=tenant_id)
            .order_by('-occurred_at')
            .values('event_type', 'event_category')[:10]
        )
        event_summary = ', '.join(
            f"{e['event_type']} ({e['event_category']})"
            for e in recent_events
        ) or 'none'

        system = (
            "You are the Zentinelle AI assistant — an expert on AI agent "
            "governance, risk, and compliance.\n\n"
            "You are embedded in the Zentinelle GRC portal. "
            "The current tenant has:\n"
            f"- {agent_count} registered agents "
            f"({healthy_count} healthy)\n"
            f"- {policy_count} active policies\n"
            f"- Recent events: {event_summary}\n\n"
            "You can help with:\n"
            "- Explaining why agent actions were blocked "
            "(policy violations)\n"
            "- Recommending policy configurations\n"
            "- Summarizing compliance status across frameworks "
            "(SOC2, GDPR, HIPAA, EU AI Act, NIST)\n"
            "- Analyzing risk and incident patterns\n"
            "- Configuring content scanning rules\n"
            "- Understanding the policy inheritance model "
            "(Org > Team > Deployment > Endpoint > User)\n\n"
            f"The user is currently viewing: "
            f"{page_context or 'the dashboard'}\n\n"
            "Be concise, specific, and actionable. "
            "Reference specific policies, agents, or events "
            "when relevant."
        )

        return system
