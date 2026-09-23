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

# Run with this gateway's own credential, from
#   python manage.py gateway_credential register <name> --tenant <id> [--tenant <id> ...]
export ZENTINELLE_URL=http://localhost:8080
export ZENTINELLE_GATEWAY_CREDENTIAL=sk_gateway_...
./zentinelle-gateway
```

In compose there is nothing to set: the backend registers the local gateway and
writes its credential into a volume both containers share (see
[The gateway credential](#the-gateway-credential)).

### Docker

```bash
docker build -t zentinelle-gateway .
docker run -p 8742:8742 \
  -e ZENTINELLE_URL=http://zentinelle:8080 \
  -e ZENTINELLE_GATEWAY_CREDENTIAL=sk_gateway_... \
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
`POST /api/zentinelle/v1/gateway/provider-key`. The agent key names the tenant
and the gateway's own credential names the gateway, and Zentinelle releases a
key only when that gateway is registered for that tenant. An agent key alone
reads nothing. Answers are cached in memory for 60 seconds
per agent key and provider, up to 10,000 entries. A revoked or rotated stored
key can therefore stay in use for up to a minute, and a newly stored key can
take as long to be picked up. Values never appear in the logs.

| Situation | Result |
|-----------|--------|
| The tenant has a stored key | That key is injected |
| No stored key, `ALLOW_ENV_PROVIDER_KEYS=true` (deprecated), env key for the provider | The gateway's env key is injected |
| No stored key and no allowed env key | `503 no_api_key` |
| The lookup fails (Zentinelle unreachable, unknown or revoked credential, a tenant this gateway is not registered for, backend error) | `502 provider_key_lookup_failed`, never the env key |

The client's `Authorization`, `x-api-key` and `x-goog-api-key` headers, and
Google's `key` query parameter, are dropped on every request, whichever key is
injected.

The gateway refuses to start with no key source: no credential, and no allowed
env key.

### The gateway credential

Every gateway has its own credential (`sk_gateway_...`), minted by Zentinelle
when the gateway is registered with the tenants it serves. In the intended
topology the gateway runs inside each cluster that hosts agents and Zentinelle
is the control plane for many of them, so the scope matters: a leaked
credential exposes only that gateway's tenants, and is revoked on its own.

```bash
python manage.py gateway_credential register prod-us-east-1 --cluster prod-us-east-1 \
  --tenant acme-corp --tenant globex        # prints the credential, once
python manage.py gateway_credential mint prod-us-east-1      # a second one, to rotate
python manage.py gateway_credential scope prod-us-east-1 --tenant acme-corp
python manage.py gateway_credential revoke prod-us-east-1 [--credential <prefix>]
python manage.py gateway_credential list                     # never shows a credential
```

The backend stores only a bcrypt hash, like an API key, and audits every
release with the gateway's name. The gateway takes its credential from:

1. `ZENTINELLE_GATEWAY_CREDENTIAL`, when set. Explicit configuration wins.
2. The file at `ZENTINELLE_GATEWAY_CREDENTIAL_FILE`, by default
   `/var/run/zentinelle/gateway-credential`. Surrounding whitespace is ignored.

| Deployment | Credential |
|------------|------------|
| Kubernetes | Registered on the control plane and piped into a Secret mounted as the file; see `deploy/kubernetes/README.md` |
| compose, zero config | The backend registers a gateway named `local`, scoped to the install's one (standalone) tenant, and writes its credential into the `gateway_credential` volume both containers mount (0600; exclusive, so replicas starting together leave one). Removing the file and restarting the backend rotates it |
| anything else | `ZENTINELLE_GATEWAY_CREDENTIAL` from wherever the deployment keeps secrets |

At startup the gateway waits up to 60 seconds for the file to appear, logging
while it waits, when the file's directory exists but the file does not. With
no directory there is nothing mounted and nothing to wait for. When the backend
refuses the credential (401 or 403) the gateway reads its file again, at most
once every ten seconds, and retries once, so a rotated credential needs no
restart. A credential from the environment is never replaced from a file, and
no credential ever appears in the logs.

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
| `ZENTINELLE_GATEWAY_CREDENTIAL` | - | This gateway's own registered credential (`sk_gateway_...`). Wins over the file below |
| `ZENTINELLE_GATEWAY_CREDENTIAL_FILE` | `/var/run/zentinelle/gateway-credential` | Where to read the credential when the variable above is unset: a mounted Secret, or the compose volume the backend writes into. Empty disables it. See [The gateway credential](#the-gateway-credential) |
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
