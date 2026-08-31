# Zentinelle LLM Gateway

A lightweight Go sidecar that sits between AI agents and LLM providers.
Agents authenticate with Zentinelle keys, the gateway injects real provider
API keys, enforces policies, and streams responses.

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

# Run
export ZENTINELLE_URL=http://localhost:8080
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
./zentinelle-gateway
```

### Docker

```bash
docker build -t zentinelle-gateway .
docker run -p 8742:8742 \
  -e ZENTINELLE_URL=http://zentinelle:8080 \
  -e OPENAI_API_KEY=sk-... \
  zentinelle-gateway
```

## How It Works

1. Agent sends request to gateway with `X-Zentinelle-Key` header
2. Gateway detects provider from request path
3. Gateway calls Zentinelle `/api/zentinelle/v1/evaluate` for policy check
4. If allowed, gateway injects real provider API key and forwards request
5. Response is streamed back to agent (SSE-aware, chunk-by-chunk)
6. After response completes, usage data is reported async to Zentinelle `/api/zentinelle/v1/events`

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
| `/health` | Liveness, and which providers have keys configured |
| `/metrics` | Prometheus text format. No authentication — scrape it from inside the cluster, not from the internet |
| everything else | Proxied to the provider the path selects |

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `8742` | Port to listen on |
| `ZENTINELLE_URL` | `http://localhost:8080` | Zentinelle API base URL |
| `PROVIDER_KEY_<NAME>` | - | API key for a provider, e.g. `PROVIDER_KEY_OPENAI`, `PROVIDER_KEY_MISTRAL`. `<NAME>` lowercased is the provider name |
| `OPENAI_API_KEY` | - | Real OpenAI API key to inject (still honoured; `PROVIDER_KEY_OPENAI` wins where both are set) |
| `ANTHROPIC_API_KEY` | - | Real Anthropic API key to inject (as above) |
| `GOOGLE_API_KEY` | - | Real Google API key to inject (as above) |
| `ZENTINELLE_TENANT_ID` | - | Tenant this gateway speaks for; sent as `X-Zentinelle-Tenant`. Omit for a single-tenant deployment |
| `ZENTINELLE_CLUSTER_ID` | - | Cluster this gateway speaks for; sent as `X-Zentinelle-Cluster`. Omit for a single-cluster deployment |
| `LOG_INTERACTIONS` | `true` | Send the prompt and completion to Zentinelle after each request, so they appear as reasoning traces. Set `false` where prompt text must not leave the cluster. An unparseable value is treated as `false` |
| `FAIL_OPEN` | `true` | Allow requests if Zentinelle is unreachable |
| `POLICY_TIMEOUT_MS` | `2000` | Max time (ms) to wait for policy check |
| `MAX_RESPONSE_BYTES` | `52428800` | Max response size (50MB) |

Adding a provider needs no code change to configure its key: set
`PROVIDER_KEY_<NAME>` and the gateway picks it up. The provider must still be
in the routing table for a path to reach it.

## Agent Configuration

Point your LLM SDK at the gateway instead of the provider:

```bash
# OpenAI
export OPENAI_BASE_URL=http://localhost:8742/v1
export OPENAI_API_KEY=unused   # gateway injects the real key

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
