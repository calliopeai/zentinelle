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
export ZENTINELLE_GATEWAY_TOKEN=<the backend's token>
./zentinelle-gateway
```

In compose there is nothing to set: the backend mints the token into a volume
both containers share (see [The gateway token](#the-gateway-token)).

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
| No stored key, `ALLOW_ENV_PROVIDER_KEYS=true` (deprecated), env key for the provider | The gateway's env key is injected |
| No stored key and no allowed env key | `503 no_api_key` |
| The lookup fails (Zentinelle unreachable, wrong token, backend error) | `502 provider_key_lookup_failed`, never the env key |

The client's `Authorization`, `x-api-key` and `x-goog-api-key` headers, and
Google's `key` query parameter, are dropped on every request, whichever key is
injected.

The gateway refuses to start with no key source: no token, and no allowed env
key.

### The gateway token

One random value, shared by the backend (which checks it) and the gateway
(which presents it). It is never derived from names or other configuration.
Each side takes it from, in order:

1. `ZENTINELLE_GATEWAY_TOKEN`, when set. Explicit configuration wins.
2. The file at `ZENTINELLE_GATEWAY_TOKEN_FILE`, by default
   `/var/run/zentinelle/gateway-token`. Surrounding whitespace is ignored.

Where each deployment gets it:

| Deployment | Token |
|------------|-------|
| compose, zero config | The backend mints 32 random bytes into the `gateway_token` volume when it starts (file mode 0600; exclusive, so replicas agree on one), and the gateway reads it from the same volume |
| compose, explicit | `make gateway-token` writes one into `.env`, which both services read. Idempotent: an existing value is kept |
| Kubernetes | A Secret generated once with `openssl rand -hex 32` and mounted as the file; see `deploy/kubernetes/README.md` |

At startup the gateway waits up to 60 seconds for the file to appear, logging
while it waits, when the file's directory exists but the file does not. With
no directory there is nothing mounted and nothing to wait for. The backend
reads its file on every lookup, and the gateway reads its file again when the
backend refuses the token (401 or 403), at most once every ten seconds, then
retries once. A rotated token therefore needs no restart on either side. A
token from the environment is never replaced from a file. The value never
appears in either side's logs.

The token reads the stored key of any tenant whose agent key it is presented
with. It is a deployment-wide credential: give it only to gateways you would
trust with those keys.

### Deprecated: env provider keys

`ALLOW_ENV_PROVIDER_KEYS=true` lets the gateway's own `PROVIDER_KEY_<NAME>`
(or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) serve a tenant
with no stored key. It still works, logs a deprecation warning at startup, and
will be removed in a future release: per-tenant stored keys replace it. It is
single-tenant by nature, since every tenant without a stored key would be
served on the one account those keys belong to. Without the flag, env keys are
ignored, with a warning.

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
| `ZENTINELLE_GATEWAY_TOKEN` | - | Shared secret for reading each tenant's stored provider key; the backend holds the same value. At least 32 characters. Wins over the file below |
| `ZENTINELLE_GATEWAY_TOKEN_FILE` | `/var/run/zentinelle/gateway-token` | Where to read the token when `ZENTINELLE_GATEWAY_TOKEN` is unset: the compose volume the backend mints into, or a mounted Secret. Empty disables it. See [The gateway token](#the-gateway-token) |
| `ALLOW_ENV_PROVIDER_KEYS` | `false` | **Deprecated**, to be removed. Single-tenant only: use the env keys below for a tenant with no stored key. Without it they are ignored |
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
