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

PROVIDERS = {
    'anthropic': 'https://api.anthropic.com',
    'openai': 'https://api.openai.com',
    'google': 'https://generativelanguage.googleapis.com',
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
        if provider not in PROVIDERS:
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
            # Fall back to first active endpoint for tenant (permissive)
            endpoint = AgentEndpoint.objects.filter(
                tenant_id=tenant_id,
                status=AgentEndpoint.Status.ACTIVE,
            ).first()

        if endpoint is None:
            return JsonResponse(
                {'error': 'no_endpoint', 'detail': 'No active agent endpoint found for this key'},
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
                except (ValueError, TypeError):
                    pass

        # 5. Policy evaluation
        engine = PolicyEngine()
        eval_result = engine.evaluate(endpoint, 'llm:invoke', context=context)

        if not eval_result.allowed:
            return JsonResponse(
                {
                    'error': 'policy_denied',
                    'detail': eval_result.reason or 'Request blocked by policy',
                },
                status=403,
            )

        # 6. Forward to upstream provider via httpx
        base_url = PROVIDERS[provider]
        upstream_url = f"{base_url}/{path}"
        if request.META.get('QUERY_STRING'):
            upstream_url += '?' + request.META['QUERY_STRING']

        # Build forwarding headers — strip X-Zentinelle-Key and hop-by-hop headers
        forward_headers = {}
        for header, value in request.headers.items():
            if header.lower() not in _HOP_BY_HOP:
                forward_headers[header] = value
        # Set correct Host
        provider_host = PROVIDERS[provider].replace('https://', '').replace('http://', '')
        forward_headers['Host'] = provider_host

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
                        buffered_chunks = list(upstream_response.iter_bytes())

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
                    # Re-evaluate with output context so OUTPUT_FILTER evaluator can run
                    try:
                        out_text = response_body.decode('utf-8', errors='replace')
                        output_context = dict(context)
                        output_context['output'] = out_text
                        engine.evaluate(endpoint, 'llm:response', context=output_context)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning('Output filter evaluation failed: %s', exc)

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
