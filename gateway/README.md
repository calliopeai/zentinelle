# Zentinelle LLM Gateway

A lightweight Go sidecar that sits between AI agents and LLM providers.
Agents authenticate with Zentinelle keys, the gateway injects real provider
API keys, enforces policies, and streams responses.

The provider key is the one the agent's tenant stored in Zentinelle
(Settings > LLM providers), so one gateway serves many tenants, each on its own
provider account. A provider key the client sends is always dropped, never
forwarded.

```
Agent --> Gateway (:8742) --> [Policy Check via Zentinelle API] --> Provider (OpenAI/Anthropic/Google)
                |
                +--> [Async: report usage to Zentinelle /events]
```

## Quick Start

```bash
# Build
cd gateway
go build -o zentinelle-gateway .

# Run. The token is shared with the backend, which sets the same value.
export ZENTINELLE_URL=http://localhost:8080
export ZENTINELLE_GATEWAY_TOKEN=$(openssl rand -hex 32)
./zentinelle-gateway
```

A single-tenant gateway can use its own keys instead:

```bash
export ALLOW_ENV_PROVIDER_KEYS=true
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
./zentinelle-gateway
```

### Docker

```bash
docker build -t zentinelle-gateway .
docker run -p 8742:8742 \
  -e ZENTINELLE_URL=http://zentinelle:8080 \
  -e ZENTINELLE_GATEWAY_TOKEN=... \
  zentinelle-gateway
```

## How It Works

1. Agent sends request to gateway with `X-Zentinelle-Key` header
2. Gateway detects provider from request path
3. Gateway calls Zentinelle `/api/zentinelle/v1/evaluate` for policy check
4. If allowed, gateway resolves the provider key (see below), drops any
   credential the client sent, injects the key and forwards the request
5. Response is streamed back to agent (SSE-aware, chunk-by-chunk)
6. After response completes, usage data is reported async to Zentinelle `/api/zentinelle/v1/events`

## Provider Keys

The gateway asks Zentinelle for the key the agent's tenant stored, with
`POST /api/zentinelle/v1/gateway/provider-key`. The agent key names the tenant,
and `ZENTINELLE_GATEWAY_TOKEN` entitles the gateway to read raw keys at all, so
an agent key alone reads nothing. Answers are cached in memory for 60 seconds
per agent key and provider, up to 10,000 entries. A revoked or rotated stored
key can therefore stay in use for up to a minute, and a newly stored key can
take as long to be picked up. Values never appear in the logs.

| Situation | Result |
|-----------|--------|
| The tenant has a stored key | That key is injected |
| No stored key, `ALLOW_ENV_PROVIDER_KEYS=true`, env key for the provider | The gateway's env key is injected |
| No stored key and no allowed env key | `503 no_api_key` |
| The lookup fails (Zentinelle unreachable, wrong token, backend error) | `502 provider_key_lookup_failed`, never the env key |

The client's `Authorization`, `x-api-key` and `x-goog-api-key` headers, and
Google's `key` query parameter, are dropped on every request, whichever key is
injected.

The env keys are a **single-tenant** fallback: every tenant without a stored
key would be served on the one account they belong to. Leave
`ALLOW_ENV_PROVIDER_KEYS` off on a gateway that serves more than one tenant.

The gateway refuses to start with no key source: no token, and no allowed env
key. Before this, a gateway configured only with env keys used them for
everyone; such a deployment now needs `ALLOW_ENV_PROVIDER_KEYS=true` or a token.

The token reads the stored key of any tenant whose agent key it is presented
with. It is a deployment-wide credential, so give it only to gateways the
Zentinelle operator runs. A gateway in a cluster someone else controls, against
a Zentinelle that serves other tenants too, should use the env fallback
instead.

## Route Detection

| Path | Provider | Upstream |
|------|----------|----------|
| `/v1/chat/completions` | openai | api.openai.com |
| `/v1/completions` | openai | api.openai.com |
| `/v1/models` | openai | api.openai.com |
| `/v1/messages` | anthropic | api.anthropic.com |
| `/v1beta/models/*` | google | generativelanguage.googleapis.com |
| `/proxy/{provider}/*` | explicit | per provider |
| `/health` | - | health check |

## Environment Variables

### Endpoints

| Path | Purpose |
|------|---------|
| `/health` | Liveness, and which providers have env keys the gateway will use (empty unless `ALLOW_ENV_PROVIDER_KEYS=true`) |
| `/metrics` | Prometheus text format. No authentication — scrape it from inside the cluster, not from the internet |
| everything else | Proxied to the provider the path selects |

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `8742` | Port to listen on |
| `ZENTINELLE_URL` | `http://localhost:8080` | Zentinelle API base URL |
| `ZENTINELLE_GATEWAY_TOKEN` | - | Shared secret for reading each tenant's stored provider key. Set the same value as `ZENTINELLE_GATEWAY_TOKEN` on the backend. At least 32 characters (`openssl rand -hex 32`). Unset disables the lookup |
| `ALLOW_ENV_PROVIDER_KEYS` | `false` | Single-tenant only. Use the env keys below for a tenant with no stored key. Without it they are ignored |
| `PROVIDER_KEY_<NAME>` | - | Fallback API key for a provider, e.g. `PROVIDER_KEY_OPENAI`, `PROVIDER_KEY_MISTRAL`. `<NAME>` lowercased is the provider name. Used only with `ALLOW_ENV_PROVIDER_KEYS=true` |
| `OPENAI_API_KEY` | - | Fallback OpenAI key (still honoured; `PROVIDER_KEY_OPENAI` wins where both are set) |
| `ANTHROPIC_API_KEY` | - | Fallback Anthropic key (as above) |
| `GOOGLE_API_KEY` | - | Fallback Google key (as above) |
| `ZENTINELLE_TENANT_ID` | - | Tenant this gateway speaks for; sent as `X-Zentinelle-Tenant`. Omit for a single-tenant deployment |
| `ZENTINELLE_CLUSTER_ID` | - | Cluster this gateway speaks for; sent as `X-Zentinelle-Cluster`. Omit for a single-cluster deployment |
| `LOG_INTERACTIONS` | `false` | Send the prompt and completion to Zentinelle after each request, so they appear as reasoning traces. Set `false` where prompt text must not leave the cluster. An unparseable value is treated as `false` |
| `FAIL_OPEN` | `false` | Policy/authentication failures deny access; `true` is rejected |
| `POLICY_TIMEOUT_MS` | `2000` | Max time (ms) to wait for the policy check, and for the provider-key lookup |
| `MAX_RESPONSE_BYTES` | `52428800` | Max response size (50MB) |

Adding a provider needs no code change to configure its key: store it for the
tenant in Zentinelle, or set `PROVIDER_KEY_<NAME>` for the fallback. The
provider must still be in the routing table for a path to reach it.

## Agent Configuration

Point your LLM SDK at the gateway instead of the provider:

```bash
# OpenAI
export OPENAI_BASE_URL=http://localhost:8742/v1
export OPENAI_API_KEY=unused   # dropped by the gateway, which injects the tenant's key

# Anthropic
export ANTHROPIC_BASE_URL=http://localhost:8742
```

Add the Zentinelle key header to requests:

```python
# OpenAI Python SDK
from openai import OpenAI
client = OpenAI(
    base_url="http://localhost:8742/v1",
    default_headers={"X-Zentinelle-Key": "sk_agent_..."},
)

# Anthropic Python SDK
import anthropic
client = anthropic.Anthropic(
    base_url="http://localhost:8742",
    default_headers={"X-Zentinelle-Key": "sk_agent_..."},
)
```

## Testing

```bash
go test -v ./...
```

## Design

- **Zero external dependencies** -- net/http, encoding/json, io, sync, log only
- **Streaming first** -- http.Flusher for SSE, chunk-by-chunk forwarding
- **Non-blocking usage** -- goroutine, fire-and-forget
- **Graceful shutdown** -- SIGTERM/SIGINT, drain connections
- **Structured logging** -- JSON to stderr
- **Request tracing** -- UUID per request, forwarded as X-Request-ID
