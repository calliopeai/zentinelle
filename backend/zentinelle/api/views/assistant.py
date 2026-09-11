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
import queue
import threading

from django.http import JsonResponse, StreamingHttpResponse
from rest_framework.permissions import BasePermission
from rest_framework.views import APIView

from zentinelle.api.permissions import PORTAL_AUTH, PortalAccess
from zentinelle.auth.mode import is_open_mode

logger = logging.getLogger(__name__)


class IsAuthenticatedOrOpenMode(BasePermission):
    """Allow if authenticated OR if AUTH_MODE=open."""

    def has_permission(self, request, view):
        if is_open_mode():
            return True
        return bool(request.user and request.user.is_authenticated)


class AssistantExecuteToolView(APIView):
    """Deterministically execute a tool the user has approved.

    POST /api/zentinelle/v1/assistant/execute-tool
    Body: {"name": "create_policy", "args": {...}}

    Bypasses the LLM so the approved args are run exactly as shown.
    Returns the tool result so the frontend can inline it in the chat.
    """

    permission_classes = [PortalAccess]
    authentication_classes = PORTAL_AUTH

    def post(self, request):
        try:
            data = json.loads(request.body)
        except (json.JSONDecodeError, ValueError):
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        name = data.get('name', '')
        args = data.get('args', {}) or {}

        if not name:
            return JsonResponse({'error': 'name is required'}, status=400)

        from zentinelle.services.llm_tools import (MUTATION_TOOLS,
                                                   REQUIRES_CONFIRMATION,
                                                   TOOL_DISPATCH, execute_tool)

        if name not in TOOL_DISPATCH:
            return JsonResponse({'error': f'Unknown tool: {name}'}, status=400)
        if name not in REQUIRES_CONFIRMATION and name not in MUTATION_TOOLS:
            return JsonResponse(
                {'error': 'Tool does not require confirmation'}, status=400
            )

        from zentinelle.schema.auth_helpers import get_request_tenant_id
        tenant_id = get_request_tenant_id(request.user)
        if not tenant_id and is_open_mode():
            tenant_id = '00000000-0000-0000-0000-000000000001'
        if not tenant_id:
            return JsonResponse({'error': 'Tenant required'}, status=403)

        actor = (
            str(request.user.id)
            if request.user.is_authenticated and hasattr(request.user, 'id')
            else 'open-mode'
        )

        from zentinelle.services.approvals import (consume_approvals,
                                                   context_digest,
                                                   find_approval)
        approval = find_approval(
            data.get('approval_token'), tenant_id=tenant_id, kind='assistant',
            subject=actor, action=name, digest=context_digest(args),
        )
        if not approval or not consume_approvals([approval.pk], tenant_id=tenant_id):
            return JsonResponse({'error': 'Confirmation is expired, used, or does not match this action'}, status=403)

        # Execute and audit
        result_str = execute_tool(name, args, tenant_id)
        try:
            result_obj = json.loads(result_str)
        except json.JSONDecodeError:
            result_obj = {'raw': result_str}

        if name in MUTATION_TOOLS:
            try:
                from zentinelle.models import AuditLog
                from zentinelle.services.llm_provider import \
                    _resource_id_from_args
                res_type, res_id = _resource_id_from_args(name, args, result_obj)
                AuditLog.log(
                    tenant_id=tenant_id,
                    action=f'assistant.{name}',
                    resource_type=res_type,
                    resource_id=res_id,
                    resource_name=str(args.get('name', '') or '')[:255],
                    ext_user_id=actor,
                    changes={'args': args},
                    metadata={'tool': name, 'approved': True,
                              'success': bool(result_obj.get('success'))},
                )
            except Exception as e:
                logger.warning('Audit log write failed for %s: %s', name, e)

        return JsonResponse({
            'name': name,
            'args': args,
            'result': result_obj,
        })


class AssistantChatView(APIView):
    """Stream a GRC-aware AI assistant response."""

    permission_classes = [PortalAccess]
    authentication_classes = PORTAL_AUTH

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
        approved_actions = []  # Confirmation is accepted only by execute-tool.

        if not message:
            return JsonResponse(
                {'error': 'Message is required'}, status=400
            )

        from zentinelle.schema.auth_helpers import get_request_tenant_id
        tenant_id = get_request_tenant_id(request.user)
        if not tenant_id and is_open_mode():
            tenant_id = '00000000-0000-0000-0000-000000000001'
        if not tenant_id:
            tenant_id = 'default'

        from zentinelle.models import TenantConfig
        tenant_settings = TenantConfig.objects.filter(tenant_id=tenant_id).values_list('settings', flat=True).first() or {}
        model_override = tenant_settings.get('assistant_model', '')
        provider_override = tenant_settings.get('assistant_provider', '')
        if not model and model_override:
            model = model_override
        if not provider and provider_override:
            provider = provider_override

        from zentinelle.services.assistant_guardrails import \
            check_support_message
        guardrail = check_support_message(tenant_id, message)
        if not guardrail.allowed:
            self._audit_guardrail_denial(tenant_id, 'input', guardrail.reason, guardrail.policy_ids)
            return JsonResponse({
                'error': 'assistant_guardrail_denied',
                'detail': guardrail.reason,
                'policies_evaluated': list(guardrail.policy_ids),
            }, status=422)

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

        actor = (
            str(request.user.id)
            if request.user.is_authenticated and hasattr(request.user, 'id')
            else 'open-mode'
        )

        response = StreamingHttpResponse(
            self._stream_response(
                messages, model, provider, system_prompt, tenant_id,
                approved_actions, actor,
            ),
            content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

    def _stream_response(self, messages, model, provider, system_prompt,
                         tenant_id, approved_actions, actor):
        """Sync generator bridging async agentic_chat into SSE.

        Uses a thread + queue so events ship as they are produced — no
        collect-then-dump.

        Emits structured events the frontend renders distinctly:
          - {'content': str} — text delta
          - {'tool_call': name, 'args': {...}, 'hash': ...} — running
          - {'tool_result': name, 'result': {...}} — completed
          - {'pending_action': name, 'args': {...}, 'hash': ..., 'preview': str}
          - {'navigation': {'path': ..., 'label': ...}}
        """
        from zentinelle.services.llm_provider import (agentic_chat,
                                                      detect_provider)

        if not provider:
            provider = detect_provider(model)

        q: queue.Queue = queue.Queue()
        SENTINEL = object()
        buffered_text = []

        def producer():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def run():
                try:
                    async for ev in agentic_chat(
                        messages, model, provider,
                        system_prompt=system_prompt,
                        tenant_id=tenant_id,
                        approved_actions=approved_actions,
                        actor=actor,
                    ):
                        q.put(ev)
                except Exception as e:
                    logger.exception("Assistant chat stream error")
                    q.put({'type': 'error', 'message': str(e)})
                finally:
                    q.put(SENTINEL)

            try:
                loop.run_until_complete(run())
            finally:
                loop.close()

        threading.Thread(target=producer, daemon=True).start()

        while True:
            ev = q.get()
            if ev is SENTINEL:
                break
            kind = ev.get('type')
            if kind == 'text':
                buffered_text.append(ev.get('content', ''))
            elif kind == 'tool_call':
                yield f"data: {json.dumps({'tool_call': ev['name'], 'args': ev.get('args', {}), 'hash': ev.get('hash', '')})}\n\n"
            elif kind == 'tool_result':
                yield f"data: {json.dumps({'tool_result': ev['name'], 'result': ev.get('result', {})})}\n\n"
            elif kind == 'pending_action':
                from zentinelle.services.approvals import issue_approval
                ev['hash'] = issue_approval(tenant_id=tenant_id, kind='assistant', subject=actor,
                                            action=ev['name'], context=ev.get('args', {}))
                yield f"data: {json.dumps({'pending_action': ev['name'], 'args': ev.get('args', {}), 'hash': ev.get('hash', ''), 'preview': ev.get('preview', '')})}\n\n"
            elif kind == 'navigation':
                yield f"data: {json.dumps({'navigation': {'path': ev.get('path', ''), 'label': ev.get('label', '')}})}\n\n"
            elif kind == 'error':
                yield f"data: {json.dumps({'error': ev.get('message', 'stream error')})}\n\n"

        from zentinelle.services.assistant_guardrails import \
            check_support_output
        complete_text = ''.join(buffered_text)
        output_check = check_support_output(complete_text)
        if output_check.allowed:
            if complete_text:
                yield f"data: {json.dumps({'content': complete_text})}\n\n"
        else:
            self._audit_guardrail_denial(tenant_id, 'output', output_check.reason, ())
            yield f"data: {json.dumps({'error': 'assistant_guardrail_denied', 'detail': output_check.reason})}\n\n"
        yield "data: [DONE]\n\n"

    @staticmethod
    def _audit_guardrail_denial(tenant_id, boundary, reason, policy_ids):
        """Record a denial without persisting user prompt or model content."""
        try:
            from zentinelle.models import AuditLog
            AuditLog.log(tenant_id=tenant_id, action='assistant.guardrail_denied',
                         resource_type='assistant', resource_id=boundary,
                         changes={'boundary': boundary, 'reason': reason[:255],
                                  'policy_ids': list(policy_ids)})
        except Exception:
            logger.warning('Unable to audit assistant guardrail denial', exc_info=True)

    def _build_system_prompt(self, request, page_context):
        """Build a system prompt enriched with the tenant's actual GRC data.

        Includes real agent IDs, policy names, recent incidents, and risks
        so the model has grounded data to reference instead of hallucinating.
        """
        from zentinelle.models import (AgentEndpoint, Event, Incident, Policy,
                                       Risk)
        from zentinelle.schema.auth_helpers import get_request_tenant_id

        tenant_id = get_request_tenant_id(request.user)
        if not tenant_id and is_open_mode():
            tenant_id = '00000000-0000-0000-0000-000000000001'
        if not tenant_id:
            tenant_id = 'default'

        # Real agent inventory (top 20 most recent)
        agents = list(
            AgentEndpoint.objects.filter(tenant_id=tenant_id)
            .order_by('-updated_at')
            .values('agent_id', 'name', 'agent_type', 'status', 'health')[:20]
        )
        agent_count = len(agents)
        healthy_count = sum(1 for a in agents if a['health'] == 'healthy')

        # Real policy list
        policies = list(
            Policy.objects.filter(tenant_id=tenant_id, enabled=True)
            .order_by('-priority')
            .values('name', 'policy_type', 'scope_type', 'enforcement')[:20]
        )

        # Recent events (last 10 with type + category)
        recent_events = list(
            Event.objects.filter(tenant_id=tenant_id)
            .order_by('-occurred_at')
            .values('event_type', 'event_category')[:10]
        )
        event_summary = ', '.join(
            f"{e['event_type']} ({e['event_category']})"
            for e in recent_events
        ) or 'none'

        # Open incidents and high-priority risks
        open_incidents = list(
            Incident.objects.filter(tenant_id=tenant_id)
            .exclude(status__in=['resolved', 'closed'])
            .order_by('-occurred_at')
            .values('title', 'severity', 'status', 'incident_type')[:5]
        )
        top_risks = list(
            Risk.objects.filter(tenant_id=tenant_id)
            .exclude(status__in=['closed', 'accepted'])
            .order_by('-likelihood', '-impact')
            .values('name', 'category', 'likelihood', 'impact', 'status')[:5]
        )

        # Format agent inventory
        if agents:
            agent_lines = '\n'.join(
                f"  - `{a['agent_id']}` ({a['agent_type']}) — "
                f"\"{a['name']}\" [{a['status']}/{a['health']}]"
                for a in agents
            )
        else:
            agent_lines = '  (none registered)'

        # Format policy list
        if policies:
            policy_lines = '\n'.join(
                f"  - \"{p['name']}\" — {p['policy_type']} at "
                f"{p['scope_type']} scope, {p['enforcement']} enforcement"
                for p in policies
            )
        else:
            policy_lines = '  (no enabled policies)'

        # Format incidents
        if open_incidents:
            incident_lines = '\n'.join(
                f"  - \"{i['title']}\" — {i['severity']}/{i['status']} "
                f"({i['incident_type']})"
                for i in open_incidents
            )
        else:
            incident_lines = '  (none open)'

        # Format risks
        if top_risks:
            risk_lines = '\n'.join(
                f"  - \"{r['name']}\" — {r['category']}, "
                f"L{r['likelihood']}xI{r['impact']}, {r['status']}"
                for r in top_risks
            )
        else:
            risk_lines = '  (no open risks)'

        system = (
            "You are the Zentinelle AI assistant — an expert on AI agent "
            "governance, risk, and compliance, embedded in the GRC portal.\n\n"
            "You have TOOLS to query and modify the system. Prefer calling "
            "a tool over guessing. The summary below is a snapshot only — "
            "use tools when you need fresh, complete, or detailed data.\n\n"
            "SNAPSHOT (refresh with tools when uncertain):\n\n"
            f"Agents ({agent_count} total, {healthy_count} healthy):\n"
            f"{agent_lines}\n\n"
            f"Active Policies ({len(policies)}):\n"
            f"{policy_lines}\n\n"
            f"Open Incidents:\n"
            f"{incident_lines}\n\n"
            f"Top Open Risks:\n"
            f"{risk_lines}\n\n"
            f"Recent Events: {event_summary}\n\n"
            "TOOL USE PRINCIPLES:\n"
            "- Read tools (list_*, get_*) — call freely whenever you need data.\n"
            "- Reversible tools (acknowledge_*, review_risk) — call when "
            "asked.\n"
            "- Mutation tools (create_policy, update_policy, toggle_policy, "
            "create_risk, update_risk, resolve_incident) — when you call one "
            "of these the result will say 'pending_confirmation: true'. The "
            "action HAS NOT RUN. The UI shows the user an Approve button. "
            "STRICT RULES when you see pending_confirmation:\n"
            "  * NEVER say 'created', 'updated', 'done', 'successfully' or "
            "anything implying the action ran.\n"
            "  * Describe the proposed action in 1-2 sentences.\n"
            "  * Tell the user 'Click Approve to run this'.\n"
            "  * STOP. Do not call the tool again.\n"
            "  * Do NOT call any other tool to verify it ran — it didn't.\n"
            "- navigate_to — use to point the user at a useful page.\n"
            "- After read tools, narrate what you found in 1-2 lines.\n\n"
            "POLICY CREATION TIPS:\n"
            "- Always set scope_type='organization' unless the user "
            "specifies otherwise.\n"
            "- For rate_limit: include both requests_per_minute and "
            "tokens_per_day.\n"
            "- For tool_permission: prefer allowlists over denylists.\n"
            "- Use suggest_policies_for_gaps when the user asks 'what's "
            "missing?' or 'what should I configure?'\n\n"
            f"User is currently on: {page_context or 'the dashboard'}\n\n"
            "STYLE:\n"
            "- Be terse. Chat panel is ~400px wide.\n"
            "- NEVER use emojis or unicode icons.\n"
            "- Markdown: **bold**, `code`, bullet lists. Skip greetings.\n"
            "- ONLY reference IDs that came from a tool result or the "
            "snapshot. Never invent IDs.\n"
            "- If you can't help, say so plainly — don't waffle."
        )

        return system
