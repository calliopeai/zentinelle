# Zentinelle LLM Gateway — Architecture Spec

> This document serves as both the architecture reference and the specification
> for rebuilding the gateway in another language (e.g., Rust with Tokio/Hyper).

## Purpose

The gateway is the mandatory enforcement point for all LLM traffic in an
organization. Agents authenticate with Zentinelle keys — the gateway holds
and injects real provider API keys. No agent ever sees or needs a real
OpenAI/Anthropic/Google key.

The injected key is the one the agent's tenant stored in Zentinelle, so one
gateway serves many tenants, each on its own provider account (#380). The
gateway's own env keys are a deprecated single-tenant fallback, used only
when `ALLOW_ENV_PROVIDER_KEYS=true` and the tenant has no stored key.

Each gateway authenticates the lookup with its own registered credential
(`sk_gateway_...`), and Zentinelle releases a key only for the tenants that
gateway is registered for, so one leaked cluster exposes only its own tenants.
The credential is `ZENTINELLE_GATEWAY_CREDENTIAL`, or else the file at
`ZENTINELLE_GATEWAY_CREDENTIAL_FILE` (default
`/var/run/zentinelle/gateway-credential`): on Kubernetes a mounted Secret, in a
standalone compose install a file the backend writes for its `local` gateway.
The gateway waits up to 60 seconds at startup for the file, and reads it again
when the backend refuses the credential.

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
- **Stateless**: no sessions and no durable state. The only local state is a
  60-second in-memory cache of provider-key lookups, which any instance can
  rebuild, and the counters its cluster heartbeat reports. Any instance can handle any request.
- **N+1 redundancy**: lose one instance, traffic routes to others.
- **Independent scaling**: scale gateway tier based on request volume, backend based on policy complexity.
- **Zero shared state**: provider keys come from Zentinelle per tenant, or
  from env vars for the single-tenant fallback (injected by orchestrator).

## Request Flow

```
1. Agent sends request to gateway with X-Zentinelle-Key header
2. Gateway extracts agent key and request metadata (provider, model, tokens)
3. Gateway calls Zentinelle /api/zentinelle/v1/evaluate (policy check)
   - Timeout: 2 seconds (configurable)
   - On timeout or non-success response: fail-closed; unsafe `FAIL_OPEN=true` is rejected at startup
4. If denied: return 403 with policy reason
5. Gateway resolves the provider key: the tenant's stored key via
   POST /api/zentinelle/v1/gateway/provider-key (agent key plus
   X-Zentinelle-Gateway-Credential, released only for a tenant the gateway is
   registered for, cached 60s per agent key and provider), else the env key
   if ALLOW_ENV_PROVIDER_KEYS=true (deprecated), else 503. A refused
   credential is re-read from its file and retried once; a failed lookup is a
   502 and never falls back to the env key
6. Gateway drops the client's credentials, injects the key and forwards to provider
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

The gateway strips `X-Zentinelle-Key` before forwarding. The client's
`Authorization`, `x-api-key` and `x-goog-api-key` headers and Google's `key`
query parameter are dropped on every request, whatever the provider, and the
real provider key is set in the provider's own header.

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
| `ZENTINELLE_GATEWAY_CREDENTIAL` | — | This gateway's registered credential (`sk_gateway_...`). Wins over the file |
| `ZENTINELLE_GATEWAY_CREDENTIAL_FILE` | `/var/run/zentinelle/gateway-credential` | Credential file when the variable above is unset; empty disables it |
| `ALLOW_ENV_PROVIDER_KEYS` | `false` | Deprecated single-tenant fallback to the env keys below |
| `OPENAI_API_KEY` | — | Fallback OpenAI key |
| `ANTHROPIC_API_KEY` | — | Fallback Anthropic key |
| `GOOGLE_API_KEY` | — | Fallback Google key |
| `FAIL_OPEN` | `true` | Allow on policy check timeout |
| `POLICY_TIMEOUT_MS` | `2000` | Policy check timeout |
| `MAX_RESPONSE_BYTES` | `52428800` | 50MB response cap |
| `HEARTBEAT_INTERVAL_SECONDS` | `60` | Cluster heartbeat interval until the answer names one; `0` turns it off, otherwise 10 to 3600 |

## Cluster Heartbeat

A gateway that Astrolift registered for a cluster reports on it (#391):
`POST /api/zentinelle/v1/astrolift/clusters/{ZENTINELLE_CLUSTER_ID}/heartbeat`
with `X-Zentinelle-Gateway-Credential` and `{"status", "version", "counters":
{"requests", "blocked", "agents_seen"}}`. It runs when the cluster id and a
credential source are set, sends once at start, then waits the answer's
`next_heartbeat_seconds` (clamped to 10s..1h) moved by up to a tenth either way.

- Counters are running totals since the process started. Zentinelle stores
  each beat's counters as they are, so a beat never resets them.
- Status covers the window since the last delivered beat: request-time policy
  checks with no usable answer (transport error, timeout, 5xx, unreadable) and
  failed provider-key lookups. All of either failed: `unhealthy`; some:
  `degraded`; none: `healthy`. A 4xx from `/evaluate` is an answer about the
  agent, not a failure. Calls abandoned by the client are not counted.
- `agents_seen` counts distinct agent keys Zentinelle decided on, held as
  SHA-256 digests, bounded at 100,000.
- A failure retries after 10s, doubling to 5 minutes. 401/403: read the
  credential file again and retry once if it changed. 404: log once, send
  nothing until the credential file changes. Redirects are not followed; a 2xx
  counts only with `{"acknowledged": true}`.
- The build version comes from `-ldflags "-X main.version=..."` (the Dockerfile's
  `VERSION` build argument), `dev` otherwise.

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
