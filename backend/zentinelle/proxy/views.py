"""
LLM proxy — transparent HTTPS passthrough with policy enforcement.

Routes:
    /proxy/anthropic/*  → api.anthropic.com
    /proxy/openai/*     → api.openai.com
    /proxy/generic/*    → per-tenant configured base URL (future)

The agent sets its LLM SDK base_url to point here instead of the provider.
Authentication: agent's sk_agent_* key in X-Zentinelle-Key header.
The original provider API key passes through in the Authorization header.

Note: httpx is required (already used by ClientCoveTenantResolver).
"""
import json
import logging

from django.http import JsonResponse, StreamingHttpResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt


def _extract_sse_text(content: bytes) -> str:
    """
    Extract concatenated assistant text from a buffered SSE stream.

    Handles both OpenAI and Anthropic streaming formats:
    - OpenAI: data: {"choices": [{"delta": {"content": "..."}}]}
    - Anthropic: data: {"delta": {"type": "text_delta", "text": "..."}}
    """
    text_parts = []
    try:
        text = content.decode('utf-8', errors='replace')
    except Exception:
        return ''

    for line in text.splitlines():
        if not line.startswith('data: '):
            continue
        data_str = line[6:].strip()
        if data_str == '[DONE]':
            break
        try:
            data = json.loads(data_str)
        except (ValueError, TypeError):
            continue

        # OpenAI streaming format
        for choice in data.get('choices', []):
            delta = choice.get('delta', {})
            chunk = delta.get('content') or delta.get('text') or ''
            if chunk:
                text_parts.append(chunk)

        # Anthropic streaming format
        delta = data.get('delta', {})
        if delta.get('type') == 'text_delta':
            chunk = delta.get('text') or ''
            if chunk:
                text_parts.append(chunk)

    return ''.join(text_parts)

from zentinelle.auth.resolver import StandaloneTenantResolver
from zentinelle.models import AgentEndpoint
from zentinelle.services.policy_engine import PolicyEngine

logger = logging.getLogger(__name__)

MAX_RESPONSE_SIZE = 50 * 1024 * 1024  # 50 MB

PROVIDERS = {
    'anthropic': 'https://api.anthropic.com',
    'openai': 'https://api.openai.com/v1',
    'google': 'https://generativelanguage.googleapis.com',
}

VERTEX_REGIONS = {
    'us-central1', 'us-east1', 'us-west1', 'europe-west1',
    'europe-west4', 'asia-northeast1', 'asia-southeast1',
}

# Headers that must not be forwarded to the upstream provider.
_HOP_BY_HOP = frozenset([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
    'x-zentinelle-key',
    # Strip reverse-proxy headers that shouldn't reach upstream providers
    'x-real-ip',
    'x-forwarded-for',
    'x-forwarded-proto',
    'x-forwarded-host',
])


def _estimate_input_tokens(messages) -> int:
    """Rough estimate of input token count from a messages list."""
    if not isinstance(messages, list):
        return 0
    total_chars = sum(
        len(m.get('content', '') if isinstance(m.get('content'), str) else '')
        for m in messages
    )
    # ~4 chars per token is a common rough estimate
    return max(1, total_chars // 4)


@method_decorator(csrf_exempt, name='dispatch')
class ProxyView(View):
    """
    Transparent HTTPS proxy for LLM provider APIs with policy enforcement.

    All LLM SDK traffic is forwarded verbatim after passing the policy engine.
    The only header stripped before forwarding is X-Zentinelle-Key.
    """

    def dispatch(self, request, provider: str, path: str):
        """Route and proxy an incoming request to the upstream LLM provider."""
        # 1. Validate Zentinelle agent key
        zentinelle_key = request.headers.get('X-Zentinelle-Key', '').strip()
        if not zentinelle_key:
            return JsonResponse(
                {'error': 'missing_key', 'detail': 'X-Zentinelle-Key header is required'},
                status=401,
            )

        resolver = StandaloneTenantResolver()
        auth = resolver._validate_agent_key(zentinelle_key)

        if not auth.valid:
            return JsonResponse(
                {'error': 'invalid_key', 'detail': auth.error or 'Invalid agent key'},
                status=401,
            )

        tenant_id = auth.tenant_id

        # 2. Validate provider
        supported = set(PROVIDERS.keys()) | {'vertex'}
        if provider not in supported:
            return JsonResponse(
                {'error': 'unsupported_provider', 'detail': f"Provider '{provider}' is not supported"},
                status=404,
            )

        # 3. Look up AgentEndpoint for policy evaluation
        agent_user_id = auth.user_id or ''
        endpoint = None
        if agent_user_id.startswith('agent:'):
            endpoint_id = agent_user_id[len('agent:'):]
            try:
                endpoint = AgentEndpoint.objects.get(id=endpoint_id, tenant_id=tenant_id)
            except AgentEndpoint.DoesNotExist:
                pass

        if endpoint is None:
            return JsonResponse(
                {'error': 'endpoint_not_found', 'detail': 'Agent key does not match any active endpoint'},
                status=403,
            )

        # 4. Build evaluation context from request body
        context = {
            'action': 'llm:invoke',
            'provider': provider,
            'path': path,
        }

        body_bytes = b''
        if request.method in ('POST', 'PUT', 'PATCH'):
            body_bytes = request.body
            if body_bytes:
                try:
                    body_json = json.loads(body_bytes)
                    model = body_json.get('model', '')
                    if model:
                        context['model'] = model
                    messages = body_json.get('messages', [])
                    if messages:
                        context['input_tokens'] = _estimate_input_tokens(messages)
                    safety_settings = body_json.get('safetySettings', body_json.get('safety_settings', []))
                    if safety_settings:
                        context['safety_settings'] = safety_settings

                    from zentinelle.services.multimodal_scanner import analyze_request_body
                    mm = analyze_request_body(body_json, provider)
                    if mm.has_media:
                        context['multimodal'] = mm.media_summary
                        context['has_multimodal'] = True
                    if mm.combined_text:
                        context['extracted_text'] = mm.combined_text[:5000]
                except (ValueError, TypeError):
                    pass

        context['_body_bytes'] = body_bytes

        # 5. Policy evaluation
        engine = PolicyEngine()
        eval_result = engine.evaluate(endpoint, 'llm:invoke', context=context)

        # Interaction logging happens after we have the upstream response

        if not eval_result.allowed:
            return JsonResponse(
                {
                    'error': 'policy_denied',
                    'detail': eval_result.reason or 'Request blocked by policy',
                },
                status=403,
            )

        # 6. Forward to upstream provider via httpx
        if provider == 'vertex':
            upstream_url = self._build_vertex_url(request, path)
            if not upstream_url:
                return JsonResponse(
                    {'error': 'vertex_config_missing',
                     'detail': 'Set X-Vertex-Region and X-Vertex-Project headers'},
                    status=400,
                )
        else:
            base_url = PROVIDERS[provider]
            upstream_url = f"{base_url}/{path}"
        if request.META.get('QUERY_STRING'):
            upstream_url += '?' + request.META['QUERY_STRING']

        # Build forwarding headers — strip X-Zentinelle-Key and hop-by-hop headers
        forward_headers = {}
        for header, value in request.headers.items():
            if header.lower() not in _HOP_BY_HOP:
                forward_headers[header] = value
        for h in ('x-vertex-region', 'x-vertex-project'):
            forward_headers.pop(h, None)
            forward_headers.pop(h.title(), None)
        # Set correct Host (just the hostname, not the path)
        from urllib.parse import urlparse
        if provider in PROVIDERS:
            forward_headers['Host'] = urlparse(PROVIDERS[provider]).hostname
        else:
            forward_headers['Host'] = urlparse(upstream_url).hostname

        # Debug: log forwarded headers (redact auth values)
        debug_headers = {k: (v[:20] + '...' if k.lower() == 'authorization' else v) for k, v in forward_headers.items()}
        logger.info('Proxy %s %s → %s headers=%s', request.method, path, upstream_url, debug_headers)

        try:
            import httpx

            is_streaming = False
            if body_bytes:
                try:
                    bj = json.loads(body_bytes)
                    is_streaming = bool(bj.get('stream', False))
                except (ValueError, TypeError):
                    pass

            if is_streaming:
                # Buffer the full SSE response so OUTPUT_FILTER can scan before delivery.
                # This adds latency equal to the full generation time but ensures
                # output policy enforcement is real — not post-hoc.
                with httpx.Client(timeout=120.0) as client:
                    with client.stream(
                        request.method,
                        upstream_url,
                        headers=forward_headers,
                        content=body_bytes,
                    ) as upstream_response:
                        upstream_status = upstream_response.status_code
                        upstream_content_type = upstream_response.headers.get(
                            'content-type', 'text/event-stream'
                        )
                        buffered_chunks = []
                        buffered_size = 0
                        for chunk in upstream_response.iter_bytes():
                            buffered_size += len(chunk)
                            if buffered_size > MAX_RESPONSE_SIZE:
                                return JsonResponse(
                                    {'error': 'response_too_large',
                                     'detail': f'Response exceeded {MAX_RESPONSE_SIZE} bytes limit'},
                                    status=502,
                                )
                            buffered_chunks.append(chunk)

                full_content = b''.join(buffered_chunks)

                # Check for OUTPUT_FILTER policies and scan buffered content
                from zentinelle.models import Policy as _Policy
                output_filter_policies = _Policy.objects.filter(
                    tenant_id=tenant_id,
                    policy_type=_Policy.PolicyType.OUTPUT_FILTER,
                    enabled=True,
                ).exists()

                if output_filter_policies and full_content:
                    output_text = _extract_sse_text(full_content)
                    if output_text:
                        output_context = dict(context)
                        output_context['output'] = output_text
                        try:
                            filter_result = engine.evaluate(
                                endpoint, 'llm:response', context=output_context
                            )
                            if not filter_result.allowed:
                                return JsonResponse(
                                    {
                                        'error': 'output_policy_denied',
                                        'detail': filter_result.reason or 'Response blocked by output filter',
                                    },
                                    status=403,
                                )
                        except Exception as exc:
                            logger.warning('Streaming output filter evaluation failed: %s', exc)

                self._log_interaction(endpoint, provider, context, eval_result,
                                     response_body=full_content, upstream_status=upstream_status)

                def stream_generator():
                    for chunk in buffered_chunks:
                        yield chunk

                return StreamingHttpResponse(
                    stream_generator(),
                    status=upstream_status,
                    content_type=upstream_content_type,
                )
            else:
                with httpx.Client(timeout=120.0) as client:
                    upstream_response = client.request(
                        request.method,
                        upstream_url,
                        headers=forward_headers,
                        content=body_bytes,
                    )

                # 7. Optional: OUTPUT_FILTER scan on response body (non-streaming only)
                response_body = upstream_response.content
                from zentinelle.models import Policy as _Policy
                output_filter_policies = _Policy.objects.filter(
                    tenant_id=tenant_id,
                    policy_type=_Policy.PolicyType.OUTPUT_FILTER,
                    enabled=True,
                ).exists()

                if output_filter_policies and response_body:
                    try:
                        out_text = response_body.decode('utf-8', errors='replace')
                        output_context = dict(context)
                        output_context['output'] = out_text
                        filter_result = engine.evaluate(endpoint, 'llm:response', context=output_context)
                        if not filter_result.allowed:
                            return JsonResponse(
                                {'error': 'output_policy_denied',
                                 'detail': filter_result.reason or 'Response blocked by output filter'},
                                status=403,
                            )
                    except Exception as exc:
                        logger.warning('Output filter evaluation failed: %s', exc)

                self._log_interaction(endpoint, provider, context, eval_result,
                                     response_body=response_body,
                                     upstream_status=upstream_response.status_code)

                from django.http import HttpResponse
                django_response = HttpResponse(
                    response_body,
                    status=upstream_response.status_code,
                    content_type=upstream_response.headers.get(
                        'content-type', 'application/octet-stream'
                    ),
                )
                return django_response

        except httpx.ConnectError as exc:
            logger.error('Proxy connect error to %s: %s', upstream_url, exc)
            return JsonResponse(
                {'error': 'upstream_unreachable', 'detail': str(exc)},
                status=502,
            )
        except httpx.TimeoutException as exc:
            logger.error('Proxy timeout to %s: %s', upstream_url, exc)
            return JsonResponse(
                {'error': 'upstream_timeout', 'detail': str(exc)},
                status=504,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error('Proxy error forwarding to %s: %s', upstream_url, exc)
            return JsonResponse(
                {'error': 'proxy_error', 'detail': 'An internal proxy error occurred'},
                status=502,
            )

    @staticmethod
    def _build_vertex_url(request, path):
        """Build Vertex AI upstream URL from request headers."""
        region = (request.headers.get('X-Vertex-Region', '') or
                  request.META.get('HTTP_X_VERTEX_REGION', '')).strip()
        project = (request.headers.get('X-Vertex-Project', '') or
                   request.META.get('HTTP_X_VERTEX_PROJECT', '')).strip()

        if not region or not project:
            import os
            region = region or os.environ.get('VERTEX_REGION', '')
            project = project or os.environ.get('VERTEX_PROJECT', '')

        if not region or not project:
            return None

        if region not in VERTEX_REGIONS:
            logger.warning('Unknown Vertex AI region: %s', region)

        return f'https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/{path}'

    def _log_interaction(self, endpoint, provider, context, eval_result,
                         response_body=None, upstream_status=None):
        """Log proxy request to InteractionLog and record usage metrics."""
        from django.utils import timezone
        from zentinelle.models.compliance import InteractionLog
        from zentinelle.services.usage_tracking import UsageTrackingService

        model = context.get('model', '')
        input_tokens = context.get('input_tokens', 0)
        output_tokens = 0
        output_content = ''
        latency_ms = None
        total_tokens = input_tokens

        if response_body:
            parsed = self._parse_provider_response(provider, response_body)
            output_tokens = parsed.get('output_tokens', 0)
            input_tokens = parsed.get('input_tokens', input_tokens)
            total_tokens = input_tokens + output_tokens
            output_content = parsed.get('output_text', '')[:2000]
            latency_ms = parsed.get('latency_ms')

        cost = None
        if model and total_tokens > 0:
            in_cost, out_cost = UsageTrackingService.calculate_cost(model, input_tokens, output_tokens)
            cost = float(in_cost + out_cost)

        body_bytes = context.get('_body_bytes', b'')
        input_preview = ''
        if body_bytes:
            try:
                body_json = json.loads(body_bytes)
                messages = body_json.get('messages', [])
                if messages:
                    last_msg = messages[-1]
                    content = last_msg.get('content', '')
                    input_preview = content[:2000] if isinstance(content, str) else json.dumps(content, default=str)[:2000]
                else:
                    input_preview = body_json.get('prompt', '')[:2000]
            except (ValueError, TypeError):
                pass
        if not input_preview:
            input_preview = f"{provider}/{context.get('path', '')}"

        user_identifier = context.get('user_id', '')

        try:
            InteractionLog.objects.create(
                tenant_id=endpoint.tenant_id,
                endpoint=endpoint,
                deployment_id_ext=endpoint.deployment_id_ext,
                user_identifier=user_identifier,
                session_id=context.get('session_id', ''),
                interaction_type=InteractionLog.InteractionType.CHAT,
                ai_provider=provider,
                ai_model=model or endpoint.agent_type,
                input_content=input_preview,
                input_token_count=input_tokens or None,
                output_content=output_content or None,
                output_token_count=output_tokens or None,
                total_tokens=total_tokens or None,
                estimated_cost_usd=cost,
                latency_ms=latency_ms,
                classification='model_request',
                topics=[provider, model] if model else [provider],
                tool_calls=[],
                occurred_at=timezone.now(),
            )
        except Exception as e:
            logger.warning('Failed to log proxy interaction: %s', e)

        if total_tokens > 0:
            try:
                UsageTrackingService.record_usage(
                    tenant_id=endpoint.tenant_id,
                    user_identifier='',
                    provider=provider,
                    model=model or endpoint.agent_type,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    endpoint=endpoint,
                    deployment_id_ext=endpoint.deployment_id_ext,
                )
            except Exception as e:
                logger.warning('Failed to record proxy usage: %s', e)

    @staticmethod
    def _parse_provider_response(provider, response_body):
        """Extract token counts from upstream provider response."""
        result = {}
        try:
            if isinstance(response_body, bytes):
                text = response_body.decode('utf-8', errors='replace')
            else:
                text = str(response_body)

            if text.startswith('data: '):
                text_content = _extract_sse_text(response_body if isinstance(response_body, bytes) else response_body.encode())
                result['output_text'] = text_content
                for line in text.splitlines():
                    if not line.startswith('data: '):
                        continue
                    data_str = line[6:].strip()
                    if data_str == '[DONE]':
                        break
                    try:
                        data = json.loads(data_str)
                        usage = data.get('usage', {})
                        if usage:
                            result['input_tokens'] = usage.get('input_tokens', usage.get('prompt_tokens', 0))
                            result['output_tokens'] = usage.get('output_tokens', usage.get('completion_tokens', 0))
                    except (ValueError, TypeError):
                        continue
            else:
                data = json.loads(text)
                usage = data.get('usage', {})
                if usage:
                    result['input_tokens'] = usage.get('input_tokens', usage.get('prompt_tokens', 0))
                    result['output_tokens'] = usage.get('output_tokens', usage.get('completion_tokens', 0))

                choices = data.get('choices', [])
                if choices:
                    msg = choices[0].get('message', {})
                    result['output_text'] = msg.get('content', '')

                content = data.get('content', [])
                if content and isinstance(content, list):
                    texts = [c.get('text', '') for c in content if c.get('type') == 'text']
                    result['output_text'] = ''.join(texts)

        except Exception:
            pass
        return result
