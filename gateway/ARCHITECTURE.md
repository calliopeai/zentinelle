# Zentinelle LLM Gateway — Architecture Spec

> This document serves as both the architecture reference and the specification
> for rebuilding the gateway in another language (e.g., Rust with Tokio/Hyper).

## Purpose

The gateway is the mandatory enforcement point for all LLM traffic in an
organization. Agents authenticate with Zentinelle keys — the gateway holds
and injects real provider API keys. No agent ever sees or needs a real
OpenAI/Anthropic/Google key.

## Scaling Model

The gateway tier scales independently from the Django backend:

```
                    ┌─────────────────────┐
                    │   Load Balancer      │
                    └──────┬──────┬───────┘
                     ┌─────┴──┐ ┌─┴──────┐
                     │Gateway │ │Gateway  │  ← N+1 horizontal scaling
                     │  :8742 │ │  :8742  │     (stateless, no shared state)
                     └──┬─────┘ └──┬──────┘
                        │          │
              ┌─────────┴──────────┴─────────┐
              │                              │
    ┌─────────▼────────┐          ┌──────────▼──────────┐
    │  Zentinelle API   │          │  LLM Providers      │
    │  (policy checks)  │          │  (OpenAI, Anthropic) │
    │  Django :8000     │          │  (Google, Vertex)    │
    └──────────────────┘          └─────────────────────┘
```

**Key properties:**
- **Stateless** — no local state, no sessions, no cache. Any instance can handle any request.
- **N+1 redundancy** — lose one instance, traffic routes to others.
- **Independent scaling** — scale gateway tier based on request volume, backend based on policy complexity.
- **Zero shared state** — provider keys come from env vars (injected by orchestrator).

## Request Flow

```
1. Agent sends request to gateway with X-Zentinelle-Key header
2. Gateway extracts agent key and request metadata (provider, model, tokens)
3. Gateway calls Zentinelle /api/zentinelle/v1/evaluate (policy check)
   - Timeout: 2 seconds (configurable)
   - On timeout: fail-open or fail-closed (configurable)
4. If denied: return 403 with policy reason
5. Gateway looks up real provider API key from config
6. Gateway swaps auth header and forwards to provider
7. Gateway streams response back to agent
8. After response: async report usage to Zentinelle /events (fire and forget)
```

## Provider Routing

Auto-detect provider from request path:

| Path Pattern | Provider | Upstream |
|-------------|----------|----------|
| `/v1/chat/completions` | openai | api.openai.com |
| `/v1/completions` | openai | api.openai.com |
| `/v1/embeddings` | openai | api.openai.com |
| `/v1/models` | openai | api.openai.com |
| `/v1/messages` | anthropic | api.anthropic.com |
| `/v1beta/models/*` | google | generativelanguage.googleapis.com |
| `/proxy/{provider}/*` | explicit | (by provider name) |

## Auth Header Injection

| Provider | Header | Format |
|----------|--------|--------|
| OpenAI | `Authorization` | `Bearer {key}` |
| Anthropic | `x-api-key` | `{key}` |
| Google | `x-goog-api-key` | `{key}` |

The gateway strips `X-Zentinelle-Key` before forwarding. The agent's
Authorization header (if any) is replaced with the real provider key.

## Streaming

SSE streaming is the default for LLM responses:
- Detect `"stream": true` in request body
- Forward each SSE chunk immediately via `Flusher`
- Parse the final chunk for usage data (token counts)
- Non-streaming: buffer full response, extract usage, forward

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `8742` | Listen port |
| `ZENTINELLE_URL` | `http://localhost:8080` | Backend API URL |
| `OPENAI_API_KEY` | — | Real OpenAI key |
| `ANTHROPIC_API_KEY` | — | Real Anthropic key |
| `GOOGLE_API_KEY` | — | Real Google key |
| `FAIL_OPEN` | `true` | Allow on policy check timeout |
| `POLICY_TIMEOUT_MS` | `2000` | Policy check timeout |
| `MAX_RESPONSE_BYTES` | `52428800` | 50MB response cap |

## Performance Targets

| Metric | Target |
|--------|--------|
| Added latency (p99) | < 5ms (excluding policy check) |
| Policy check latency | < 50ms (cached in backend) |
| Memory per connection | < 10KB |
| Concurrent connections | 100K+ per instance |
| Startup time | < 100ms |
| Binary size | < 15MB |
| Docker image | < 20MB |

## Rust Rebuild Notes

If rebuilding in Rust:
- Use `tokio` runtime with `hyper` for HTTP
- Use `reqwest` for upstream requests (or raw `hyper` client)
- Use `serde_json` for JSON parsing
- Use `tracing` for structured logging
- SSE streaming via `hyper::Body::wrap_stream`
- Same env var config pattern
- Same API surface — drop-in replacement
- Consider `tower` middleware for the policy check layer
- Pin: `tokio = "1"`, `hyper = "1"`, `serde = "1"`, `tracing = "0.1"`
