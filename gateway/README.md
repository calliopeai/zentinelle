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
6. After the response, usage is reported async to Zentinelle `/api/zentinelle/v1/events`, one
   `llm:usage` event per call that reached the provider, including calls the output filter
   withheld or the client abandoned. The event carries an `event_id`, so a retried report is
   deduplicated. The gateway asks providers for `Accept-Encoding: identity` so it can read
   what it meters and filters.

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

## Cluster Heartbeat

A gateway that Astrolift registered for a cluster reports on it to Zentinelle,
whose portal shows the cluster as `pending` until the first heartbeat and
`stale` after five silent minutes. The heartbeat runs when
`ZENTINELLE_CLUSTER_ID` is set, the gateway has a credential (the variable or
the file), and `HEARTBEAT_INTERVAL_SECONDS` is not `0`.

The gateway sends one at start, then as often as Zentinelle's answer asks
(`next_heartbeat_seconds`, 60 today), each wait moved by up to a tenth either
way so replicas started together do not report together:
`POST /api/zentinelle/v1/astrolift/clusters/<ZENTINELLE_CLUSTER_ID>/heartbeat`
with `X-Zentinelle-Gateway-Credential` and

```json
{"status": "healthy", "version": "1.4.2", "instance": "zentinelle-gateway-7d9f-abcde", "counters": {"requests": 1200, "blocked": 7, "agents_seen": 12}}
```

| Field | Meaning |
|-------|---------|
| `status` | Judged from the gateway's own calls to Zentinelle since the last delivered heartbeat: `unhealthy` when every policy check got no answer (unreachable, timed out, 5xx) or every provider-key lookup failed, `degraded` when some did, `healthy` otherwise. An agent key Zentinelle refuses is that agent's problem and does not count |
| `version` | The image's version, `dev` for a local build |
| `instance` | This replica: the host name, which in Kubernetes is the pod name |
| `requests` | Requests the gateway received, not counting `/health` and `/metrics` |
| `blocked` | Requests refused on the policy check, fail-closed refusals included, or withheld by the output filter |
| `agents_seen` | Distinct agent keys Zentinelle made a decision on, held as SHA-256 digests and never as keys. It stops growing at 100,000 |

The counters are running totals since the gateway started. Zentinelle stores
each heartbeat's counters as they are, so a heartbeat never resets them and a
failed one loses nothing. Each replica reports for itself under its instance;
Zentinelle keeps each replica's latest totals and shows the cluster their sum
and the worst replica's status. A replica silent for five minutes stops
counting. `agents_seen` is summed too, so an agent two replicas both served is
counted twice.

A failed heartbeat is retried after 10 seconds, doubling to at most five
minutes. A 401 or 403 makes the gateway read its credential file again, as the
provider-key lookup does, and retry once if the file holds a new one. A 404
means Zentinelle has no Astrolift cluster with that id for this credential: the
compose `local` gateway, an operator's `gateway_credential register`, or a
mistyped `ZENTINELLE_CLUSTER_ID`. The gateway logs that once and sends nothing
more until its credential file changes, which is what Astrolift registering or
adopting the gateway does. No redirect is followed, and no log line holds a
credential or an agent key.

## Control Plane Passthrough

An agent whose egress is the gateway alone still has to reach the Astrolift
control plane for its keepalive. With `ASTROLIFT_CONTROL_PLANE_URL` set, the
gateway passes exactly these routes straight through to it, with no policy check,
provider-key lookup or metering, so a degraded Zentinelle does not make a live
agent look like an outage:

| Route | Caller |
|-------|--------|
| `POST /api/dispatch/v1/agents/<task id>/callback/` | The agent runner's state heartbeat and its event stream |
| `POST /api/clusters/v1/<cluster id>/heartbeat/` | The keep-alive agent's cluster heartbeat |
| `POST /api/clusters/v1/<cluster id>/model-test-result/` | The keep-alive agent's model test result, derived from its `HEARTBEAT_URL` |

It is not an open proxy. Only `POST` with `Authorization: Bearer ...` is
passed, and the control plane authenticates that key. Each id is one plain
path segment (letters, digits, `-`, `_`); the query is dropped. Only
`Authorization` and `Content-Type` are sent on, never `X-Zentinelle-Key`, and
only the status, `Content-Type` and body come back. No redirect is followed.
These calls are not counted in `requests` or the metrics. Unset, the routes
are refused like any other unknown path.

## Route Detection

| Path | Provider | Upstream |
|------|----------|----------|
| `/v1/chat/completions` | openai | api.openai.com |
| `/v1/completions` | openai | api.openai.com |
| `/v1/messages` | anthropic | api.anthropic.com |
| `/v1beta/models/*` | google | generativelanguage.googleapis.com |
| `/proxy/{provider}/*` | explicit | per provider |
| `/health` | - | health check |

Only `POST` to an inference route is forwarded; anything else is `403
path_not_allowed`, because files, batches, fine-tunes and vector stores would
run on the tenant's key while policy sees no request body. The routes:

- OpenAI: `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, `/v1/embeddings`
- Anthropic: `/v1/messages`, `/v1/messages/count_tokens`, `/v1/complete`
- Google: `/v1(beta)/models/<model>:` with `generateContent`,
  `streamGenerateContent`, `countTokens`, `embedContent` or `batchEmbedContents`

## Environment Variables

### Endpoints

| Path | Purpose |
|------|---------|
| `/health` | Liveness, and which providers have env keys the gateway will use (empty unless `ALLOW_ENV_PROVIDER_KEYS=true`). Stays 200 while the replica drains |
| `/ready` | Readiness: 200 `{"status": "ready"}`, or 503 `{"status": "draining"}` from SIGTERM on. Point the load balancer's health check and the readiness probe here. See [Scale-out and Draining](#scale-out-and-draining) |
| `/metrics` | Prometheus text format. No authentication — scrape it from inside the cluster, not from the internet |
| `/api/dispatch/v1/agents/<id>/callback/`, `/api/clusters/v1/<id>/heartbeat/`, `/api/clusters/v1/<id>/model-test-result/` | Passed to the control plane when `ASTROLIFT_CONTROL_PLANE_URL` is set. See [Control Plane Passthrough](#control-plane-passthrough) |
| an inference route | Proxied to the provider the path selects (see Route Detection) |

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
| `ZENTINELLE_CLUSTER_ID` | - | Cluster this gateway speaks for; sent as `X-Zentinelle-Cluster`, and the Astrolift cluster its heartbeat reports on. Omit for a single-cluster deployment |
| `HEARTBEAT_INTERVAL_SECONDS` | `60` | Seconds between cluster heartbeats until Zentinelle's answer names its own interval, which then wins. `0` turns heartbeats off; otherwise 10 to 3600. See [Cluster Heartbeat](#cluster-heartbeat) |
| `ASTROLIFT_CONTROL_PLANE_URL` | - | Astrolift control plane (`https://host[:port]`, no path) that agent heartbeats and events are passed through to. Unset turns the passthrough off. See [Control Plane Passthrough](#control-plane-passthrough) |
| `LOG_INTERACTIONS` | `false` | Send the prompt and completion to Zentinelle after each request, so they appear as reasoning traces. Set `false` where prompt text must not leave the cluster. An unparseable value is treated as `false` |
| `FAIL_OPEN` | `false` | Policy/authentication failures deny access; `true` is rejected |
| `POLICY_TIMEOUT_MS` | `2000` | Max time (ms) to wait for the policy check, and for the provider-key lookup |
| `MAX_RESPONSE_BYTES` | `52428800` | Max response size (50MB) |
| `SHUTDOWN_DELAY_SECONDS` | `5` | After SIGTERM, how long the replica keeps serving with `/ready` failing, so the load balancer stops sending to it first. 0 to 300 |
| `DRAIN_TIMEOUT_SECONDS` | `20` | Then how long requests in flight, streams included, get to finish before they are cut. 1 to 3600 |
| `METRICS_EMF_INTERVAL_SECONDS` | `0` | Seconds between CloudWatch embedded metric format lines for the scaler; `0` turns them off. See [Scale-out and Draining](#scale-out-and-draining) |
| `METRICS_EMF_NAMESPACE` | `Zentinelle/Gateway` | CloudWatch namespace of those metrics. Give each install its own |

Adding a provider needs no code change to configure its key: store it for the
tenant in Zentinelle, or set `PROVIDER_KEY_<NAME>` for the fallback. The
provider must still be in the routing table for a path to reach it.

## Scale-out and Draining

Any replica can serve any request, so the gateway scales out behind a load
balancer or a Kubernetes Service with nothing shared between replicas:

- **Rate limits, budgets and policy** are decided by Zentinelle on every
  request (`/evaluate`), with the counters in its shared Redis and database,
  so N replicas enforce one limit, not N. The gateway caches nothing about
  policy.
- **Provider keys** are cached per replica for at most 60 seconds, which is
  how long a rotated or revoked key can still be used. A new replica starts
  empty and looks keys up.
- **Usage** is reported once per request by the replica that served it, with
  a random event ID; a retry after a lost answer is a duplicate Zentinelle
  drops, not a second charge. Draining waits for these reports.
- **Heartbeat counters** are per replica (`instance`); Zentinelle sums them.

On SIGTERM a replica drains:

1. `/ready` answers 503 and keep-alive connections are closed after their
   current response, while new requests are still served for
   `SHUTDOWN_DELAY_SECONDS` (5): the load balancer's time to notice.
2. The listener closes. Requests in flight, streams included, get
   `DRAIN_TIMEOUT_SECONDS` (20) to finish; anything still open is cut and the
   exit status is 1.
3. Usage reports still sending get 5 seconds to land.

The orchestrator's stop timeout must cover all three: at least 30 seconds with
the defaults (ECS `stopTimeout`, Kubernetes `terminationGracePeriodSeconds`).
To let long streams finish, raise `DRAIN_TIMEOUT_SECONDS` and the stop timeout
together; ECS allows at most 120 seconds. Behind an ALB the target group's
deregistration delay bounds a stream too, since the ALB closes the connections
still open when it ends: set it to the longest stream that should survive a
scale-in.

For the scaler:

| Signal | Where |
|--------|-------|
| Requests in flight | `zentinelle_gateway_active_connections` on `/metrics`; `RequestsInFlight` in CloudWatch |
| Latency | `zentinelle_gateway_request_duration_seconds` histogram; `RequestLatency` in CloudWatch, a distribution CloudWatch takes p95 of |
| Request rate | `zentinelle_gateway_requests_total`; `Requests` in CloudWatch |

The CloudWatch metrics are written by the gateway itself as embedded metric
format log lines when `METRICS_EMF_INTERVAL_SECONDS` is set, in
`METRICS_EMF_NAMESPACE` with no dimensions, so the awslogs driver is all ECS
needs. Each replica writes its own, so scale on the `Average` of
`RequestsInFlight` (per replica) and the `p95` of `RequestLatency`. Latency is
counted at each request's histogram bucket upper bound (60 for anything over
30 seconds), so p95 reads high, never low.

`python3 scripts/gateway_scale_load.py` (from the repository root) proves this
locally: it builds the gateway, runs replicas against stub Zentinelle and
provider servers, scales out and in under load, and checks that no request
fails and every request's usage is recorded exactly once. It never touches a
real install.

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
- **Non-blocking usage** -- goroutine, retried on 5xx/429/no answer, drained on shutdown
- **Graceful shutdown** -- SIGTERM/SIGINT: readiness fails, then in-flight requests and usage reports drain
- **Structured logging** -- JSON to stderr
- **Request tracing** -- UUID per request, forwarded as X-Request-ID
