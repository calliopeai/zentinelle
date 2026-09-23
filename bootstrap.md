# Zentinelle — Bootstrap

Technical reference for agents and developers working in this repo.

**GitHub:** https://github.com/calliopeai/zentinelle
**Issues:** https://github.com/orgs/calliopeai/projects/4
**SDK:** [zentinelle-sdk](https://github.com/calliopeai/zentinelle-sdk)

> See [memory.md](memory.md) for persistent project decisions and current state.
> See [docs/wiki/](docs/wiki/README.md) for deep technical documentation.

---

## What Is This

Zentinelle is a standalone, MIT-licensed AI agent GRC (Governance, Risk, Compliance) platform. Companion product to [Calliope AI](https://calliope.ai) — sold and deployed independently. Self-hostable.

**Three API surfaces:**
- `POST /api/zentinelle/v1/*` — REST, agent-facing (register, evaluate, config, events, heartbeat, interaction)
- `POST /gql/zentinelle/` — GraphQL, management portal (policies, dashboards, audit, risk)
- `POST /proxy/<provider>/*` — LLM proxy, transparent passthrough with policy enforcement (anthropic, openai, google)

## Repo Structure

```
zentinelle.git/
├── bootstrap.md          # this file — technical reference
├── memory.md             # project memory and decisions
├── CLAUDE.md             # Claude Code shim
├── agents.md             # generic agents shim
├── antigravity.md        # Antigravity CLI shim
├── backend/              # Django 5.0 service
│   ├── config/           # settings, URLs, WSGI/ASGI
│   └── zentinelle/       # core Django app
│       ├── models/       # AgentEndpoint, Policy, Event, ContentScan, etc.
│       ├── api/          # REST endpoints (agent-facing)
│       ├── schema/       # GraphQL (management portal)
│       ├── services/     # policy engine, content scanner, evaluators
│       ├── tasks/        # Celery async tasks
│       └── auth/         # TenantResolver interface + implementations
├── frontend/             # Next.js 14 GRC portal (port 3002)
└── docs/wiki/            # deep technical docs
```

## Key Architecture Decisions

### Tenant Model
Every model has `tenant_id` (opaque string). No direct FK to any external User or Organization model. Tenant context is resolved via the `TenantResolver` interface — pluggable, with a default implementation for standalone mode and a managed-deployment implementation for Calliope AI-hosted instances.

See: [#9](https://github.com/calliopeai/zentinelle/issues/9)

### Database
PostgreSQL, `zentinelle` schema isolated via Django DB router. Same DB instance as host platform for now — separates cleanly when needed via `pg_dump --schema=zentinelle`.

See: [#7](https://github.com/calliopeai/zentinelle/issues/7)

### Auth
Pluggable via `TenantResolver`. In standalone mode: own auth (OIDC or username/password). In managed deployments: delegated to the managing platform. Configure via `AUTH_MODE` env var.

### Policy Scope Hierarchy
```
Organization → Team → Deployment → Endpoint → User
```
More specific scope wins. `Policy.scope_type` = what the policy targets, not where it's stored.

### The Gateway as a Cluster-Local Enforcement Point

Deployed into the cluster the agents run in, and paired with an egress policy,
the gateway turns governance from something agents opt into into something
they cannot avoid. Manifests in `deploy/kubernetes/` (#222).

The distinction that matters: without the network policy, an agent reaches
governance by being configured to, so a misconfigured agent — or a framework
that reads a base URL from somewhere nobody checked — silently escapes it.
With it, "could an agent have called a model without policy running?" is
answered no at the network layer, for any SDK and any framework.

Two policies, and the second is the one people forget:

- **agents** may reach the gateway, DNS, and their own namespace. No provider
  is in the allowed set, so a direct call fails to connect.
- **the gateway** may reach the named providers and the Zentinelle service and
  nothing else. It is the pod holding the provider keys, so that is its blast
  radius if it is ever compromised.

Matched by DNS name rather than CIDR, because provider addresses change
without notice and an IP list is wrong by the time anyone reads it. Cilium is
preferred for that reason; a vanilla NetworkPolicy fallback exists and states
its own limits.

The enrolment is a pod label, `zentinelle.ai/governed: "true"`. A pod without
it is selected by no policy and is therefore governed by none — which is worth
an audit query rather than an assumption.

Scoping across clusters: customer = `tenant_id`, cluster = `ZENTINELLE_CLUSTER_ID`,
agent = endpoint. One Zentinelle service serves many clusters, and every call
the gateway makes carries `X-Zentinelle-Tenant` and `X-Zentinelle-Cluster` so
its events can be told apart.

### Background Work: Celery Now, Temporal for Two of Three Shapes Later

Zentinelle's background work is three shapes and only two are Temporal-shaped.
Astrolift and the Client Cove provisioner already run Temporal on ECS, so the
question is how far to follow, and the answer is a split rather than a switch
(#264).

| shape | where | why |
|---|---|---|
| Event drain — `tasks.events`, `tasks.clickhouse_sync`, classification | **stays on Celery** | High volume, short-lived, stateless, row-level idempotent. Temporal is a durable-execution engine, not a message queue: a workflow per telemetry event puts ingest volume through a Postgres-backed history store for no benefit, and the failure mode is a Temporal DB that grows with ingest |
| Periodic work — `CELERY_BEAT_SCHEDULE` | **Temporal Schedules**, later | Beat is `desired_count = 1` by construction: if it dies every scheduled job silently stops, and raising the count splits the brain. The default scheduler keeps last-run state on an ephemeral Fargate filesystem, so a restart can re-fire or skip — survivable today only because the affected tasks happen to be idempotent |
| Billing and reporting — Stripe usage, monthly counts, compliance reports, daily aggregation | **Temporal workflows**, later | Multi-step and money-touching. Durable state, retry with idempotency, and the ability to see where a stuck run stopped — the same shape as the provisioner cutover already live |

**Not now, deliberately.** Zentinelle has no live installs, so there is no load
data to size a Temporal deployment against and no urgency. Rewriting the task
layer for a product that has not taken its first real install is backwards.

Revisit when either becomes true:

1. A production install is running and has produced real load figures.
2. A scheduled job misfire causes a billing or compliance incident — the
   failure mode the single beat replica is exposed to.

### Fail-Open by Default
If Zentinelle is unreachable, agents continue running. Circuit breaker in SDK. Set `fail_open: false` per policy for hard enforcement.

### Agent Hosts: One Key per Host (#377)
An Agent Host Protocol host runs many sessions across harnesses. It registers
once as `agent_type=agent_host`, and every `tool_call` evaluation names its
`harness`, `session_id`, `chat_id` and `tool_name` in `context`; sessions are
never registered. Registering each session was rejected: session churn would
become endpoint and key churn, every session would consume an agent
entitlement, and the key would sit inside the harness process the gate polices.

A host can keep a tool call pending, so an evaluation blocked only by a missing
human approval answers `ask` and opens an `ApprovalRequest` that the host polls
and an operator decides. Approving issues the ordinary single-use
`ExecutionApproval`. Unlike the SDK default above, the host gate fails closed.
Contract and examples: [docs/agent-host.md](docs/agent-host.md).

## Common Commands

### Backend
```bash
cd backend
pipenv install
pipenv run python manage.py runserver                        # port 8000
pipenv run pytest                                            # all tests
pipenv run pytest zentinelle/tests/                         # zentinelle only
pipenv run python manage.py migrate --database zentinelle    # zentinelle models (REQUIRED — uses zentinelle schema)
pipenv run python manage.py migrate                          # auth/sessions tables (default/public schema)
pipenv run python manage.py dev_utils --generate_schema      # export GraphQL schema
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3002
npm run compile    # regenerate GraphQL types (backend must be running)
npm run lint
```

### Docker
```bash
docker compose up
docker compose run backend python manage.py migrate --database zentinelle
docker compose run backend python manage.py migrate
docker compose run backend python manage.py createsuperuser
```

### Config File (zentinelle.yaml)

As an alternative to setting individual environment variables you can place a
`zentinelle.yaml` file in the repo root. The loader runs at Django startup,
before any settings are evaluated, and injects values into the environment.

**Env vars always win** — if `DATABASE_URL` is already set in the environment,
the value in the YAML file is silently ignored.

Quick start:

```bash
cp zentinelle.yaml.example zentinelle.yaml
# edit zentinelle.yaml with your values
```

To use a different path, set `ZENTINELLE_CONFIG`:

```bash
ZENTINELLE_CONFIG=/etc/zentinelle/config.yaml python manage.py runserver
```

If the file is missing or PyYAML is not installed the service starts normally
without error — it simply falls back to pure env var configuration.

The stack includes ClickHouse for audit analytics. It starts automatically and
initialises the schema from `backend/zentinelle/clickhouse/schema.sql` on first
boot. `CLICKHOUSE_URL` is pre-set in `docker-compose.yml`; no extra config needed.
To disable ClickHouse (e.g. for minimal dev), remove `CLICKHOUSE_URL` from the
compose file — all operations degrade gracefully to no-ops.

## Model Reference

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AgentEndpoint` | `agent_id` (SlugField), `api_key_hash`, `api_key_prefix`, `tenant_id`, `agent_type`, `status`, `health`, `capabilities` | `agent_type`: claude_code, gemini, codex, junohub, langchain, langgraph, mcp, chat, custom |
| `Policy` | `scope_type`, `policy_type`, `config`, `tenant_id`, `enabled`, `enforcement`, `action`, `block_level`, `escalation` | `enforcement` (the mode, and the ceiling on `action`): enforce, audit, disabled. See Policy Actions. `scope_type` = target, not location |
| `Event` | `endpoint`, `event_type`, `event_category`, `payload`, `tenant_id`, `occurred_at` | High volume — write-optimized. Categories: telemetry, audit, alert |
| `ContentScan` | `endpoint`, `content_type`, `status`, `has_violations`, `was_blocked` | |
| `InteractionLog` | `endpoint`, `ai_provider`, `ai_model`, `input_content`, `output_content`, `tool_calls`, `occurred_at` | Created by evaluate endpoint and proxy. Feeds monitoring dashboard |
| `SystemPrompt` | `name`, `content`, `version`, `tenant_id` | Versioned prompt library |
| `Risk` | `title`, `likelihood`, `impact`, `status`, `tenant_id` | 5x5 matrix |
| `Incident` | `risk`, `severity`, `status`, `timeline` | |
| `ZentinelleLicense` | `tenant_id`, `agent_entitlement_count`, `features`, `valid_until` | |

### Critical Field Names

| Model | Correct | Wrong |
|-------|---------|-------|
| `AgentEndpoint` | `agent_id` (slug) | `endpoint_id` |
| `Policy` | `scope_type` | `target_type` |
| `AgentEndpoint` | `api_key_hash` + `api_key_prefix` | `api_key` |
| All models | `tenant_id` (string) | `organization_id`, org FK |

## GraphQL Schema Ordering Rule

All ObjectType/InputType classes MUST be defined BEFORE any Query or Mutation that references them. Forward references crash Django startup (class bodies evaluated at import time).

Order in every schema file:
1. Imports
2. Enums and InputTypes
3. ObjectTypes
4. Result types (`*Result`, `*Connection`)
5. Query class
6. Mutation class

## Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| GraphQL ObjectType | `<Entity>Type` | `PolicyType`, `AgentEndpointType` |
| GraphQL Mutation | `<Verb><Entity>` | `CreatePolicy`, `RegisterAgent` |
| GraphQL Query class | `<Domain>Query` | `PolicyQuery`, `AgentQuery` |
| REST view | `<Entity>View` | `EvaluateView`, `RegisterView` |
| Service | `<Domain>Service` / `<Domain>Engine` | `PolicyEngine`, `ContentScannerService` |
| Tenant reference | `tenant_id` | always opaque string, never FK |

## Pre-Commit Validation

```bash
# Django startup check
cd backend && pipenv run python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# Migration check
pipenv run python manage.py makemigrations --check --dry-run

# Tests + lint
pipenv run pytest
pipenv run flake8
pipenv run isort --check-only .
```

## Git Workflow

- No co-authorship messages in commits
- No rebasing, no force-push
- Commit directly to `main`

## Impact Table

Use this before making changes. Columns: **d=1** = direct callers that WILL break; **d=2** = indirect that SHOULD be tested; **d=3** = transitive that MAY be affected.

| Component | d=1 (WILL BREAK) | d=2 (SHOULD TEST) | d=3 (MAY BREAK) | Risk |
|-----------|-----------------|-------------------|-----------------|------|
| `TenantResolver` interface | All auth flows, every resolver | Entire API surface (every query/mutation) | All compliance state | CRITICAL |
| GraphQL type ordering | Django startup — entire service | All portal features | — | CRITICAL |
| `PolicyEngine.evaluate()` | `/api/evaluate`, all agent enforcement | Rate limits, cost control, PII/jailbreak blocking | Compliance state, incident creation | CRITICAL |
| `tenant_id` field on any model | That model's queries and mutations | Cross-model queries (events for endpoint, etc.) | Compliance aggregations | CRITICAL |
| `AgentEndpoint.api_key_hash` | `/api/register`, all agent auth | All agent API calls | Endpoint health tracking | HIGH |
| `Event` model schema | `/api/events` ingestion | Retention TTL enforcement, SIEM export | Compliance reports | HIGH |
| `InteractionLog` model | Audit trail writes | Usage metrics, cost metering | Compliance dashboard | HIGH |
| `RetentionPolicy.enforce_ttl()` | TTL Celery task | Event and log cleanup | SIEM completeness | HIGH |
| `Policy` scope hierarchy | Policy resolution order | All multi-scope tenant evaluations | — | HIGH |
| `ContentScan` model | `/api/evaluate` content scanning | PII detection reports | GDPR/HIPAA compliance controls | MEDIUM |
| `Risk` model | Risk register CRUD | Incident creation | Compliance gap scoring | MEDIUM |
| `check_budget()` in PolicyEngine | Token budget enforcement | Cost metering | Billing accuracy | MEDIUM |

**How to use:** Find your component row. If d=1 is non-empty, run the full test suite. If Risk = CRITICAL, do not commit without passing the full pre-commit checklist.

---

## LLM Proxy

Transparent HTTPS passthrough at `/proxy/<provider>/` with policy enforcement before forwarding to upstream.

### Two paths, and which one is canonical for what

There are two proxies, and they are not interchangeable. Both enforce policy;
they differ in what else they do and in what they can see.

| | **Go gateway** (`gateway/`, :8742) | **Django proxy** (`/proxy/<provider>/`) |
|---|---|---|
| Reached by | the SDK (`zentinelle-agent proxy`) | direct API clients, the portal |
| Policy check | calls `/api/zentinelle/v1/evaluate` | `PolicyEngine.evaluate()` in process |
| Output filtering | yes, since #218 | yes |
| Interaction logging | usage only | full `InteractionLog` |
| Providers | ~20, config-driven | anthropic, openai, google, vertex |
| Provider key | the agent's tenant's stored `LLMProviderKey` (#380); env keys only with the deprecated `ALLOW_ENV_PROVIDER_KEYS` | `MANAGED_*`/env key, else the client's own |

The gateway holds an agent key, not a database. That is the whole reason for
the split: it cannot query `Policy`, so anything it must decide has to be
carried to it in an evaluation response. `output_filter_required` is the first
such flag, and the reason it exists is that without it the gateway streamed
every response straight through — an agent on the SDK proxy bypassed output
filters that applied to everyone on the Django path.

A filtered response is **buffered before any of it is written**. A filter that
redacted only what came after it would already have leaked what came before,
and on a streamed answer that is most of it. The cost is that a filtered
response arrives whole rather than token by token, which is why the buffering
is conditional on a filter existing rather than always on.

The Django proxy stays canonical for anything needing the database in the
request path: full interaction logging, and the multimodal request scan.

Provider keys are the second thing carried to the gateway (#380). Once policy
passes, it asks `POST /api/zentinelle/v1/gateway/provider-key` for the key the
agent's tenant stored, presenting the agent key (which names the tenant) and
its own registered credential (which names the gateway; an agent key alone
reads nothing). It caches the answer for 60 seconds per agent key and provider,
and it always drops whatever key the client sent. This is a separate endpoint
rather than a field on the evaluate response because a decision is made per
request and never cached, while a key is stable and can be; and the evaluate
response is the most widely read and logged payload in the system. Each release
writes an `access` audit record without the value. The gateway's env keys
remain only as a deprecated single-tenant fallback behind
`ALLOW_ENV_PROVIDER_KEYS`, and a failed lookup never falls back to them.

The gateway runs inside each cluster that hosts agents (a data plane), with
Zentinelle as the control plane for one or many of them, so there is no shared
secret between them: a single one would let one leaked cluster unlock every
tenant. Each gateway is a `GatewayRegistration` scoped to an explicit set of
`tenant_ids`, holding its own `GatewayCredential` (`sk_gateway_...`, stored as
a bcrypt hash like an API key). A key is released only when the agent's tenant
is in the gateway's scope; a registration or a single credential is revoked on
its own; rotation is a second credential, then revoking the first. Operators
use `manage.py gateway_credential` (register, mint, scope, list, revoke). The
registration carries the opaque `cluster_id` the gateway sends as
X-Zentinelle-Cluster. A gateway that an Astrolift install registered also links
to its `AstroliftCluster` (see "Connected installs and clusters" below).

The gateway reads its credential from `ZENTINELLE_GATEWAY_CREDENTIAL`, else the
file at `ZENTINELLE_GATEWAY_CREDENTIAL_FILE` (default
`/var/run/zentinelle/gateway-credential`): a mounted Secret on Kubernetes. A
standalone compose install needs no configuration: its backend registers a
gateway named `local` for the standalone tenant and writes its credential into
a volume both containers mount (exclusive create, so replicas leave one). The
gateway reads the file again when refused, so rotation needs no restart.

```
Agent SDK → local proxy (port 8742) → Zentinelle /proxy/<provider>/ → provider API
             (injects X-Zentinelle-Key)   (policy evaluation)
```

| Provider | Upstream | Agent env var |
|----------|----------|---------------|
| `anthropic` | api.anthropic.com | `ANTHROPIC_BASE_URL` |
| `openai` | api.openai.com/v1 | `OPENAI_BASE_URL` |
| `google` | generativelanguage.googleapis.com | *(programmatic — see below)* |
| `vertex` | {region}-aiplatform.googleapis.com | *(headers — see below)* |

**Gemini note:** The Google Generative AI SDKs do not natively respect a base URL env var. Configure the proxy URL programmatically when initializing the client:

```python
# Python
import google.generativeai as genai
genai.configure(api_key="...", transport="rest", client_options={"api_endpoint": "http://localhost:8742/proxy/google"})
```

```typescript
// TypeScript
const genai = new GoogleGenerativeAI(apiKey, { apiEndpoint: "http://localhost:8742/proxy/google" });
```

**Vertex AI note:** Pass project and region via headers:
```bash
curl -X POST http://localhost:8742/proxy/vertex/publishers/google/models/gemini-2.0-flash:generateContent \
  -H "X-Zentinelle-Key: sk_agent_..." \
  -H "X-Vertex-Region: us-central1" \
  -H "X-Vertex-Project: my-gcp-project" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -d '{"contents": [{"parts": [{"text": "Hello"}]}]}'
```

Or set `VERTEX_REGION` and `VERTEX_PROJECT` env vars on the Zentinelle backend.

- CSRF exempt (API-authenticated, not browser forms)
- Strips `X-Zentinelle-Key` and reverse-proxy headers before forwarding
- Streaming SSE supported (buffered for output filter evaluation)
- Creates InteractionLog records for the monitoring dashboard

## SDK (zentinelle-agent)

Repo: `zentinelle-sdk.git/plugins/agent/`
Package: `zentinelle-agent` (PyPI)
CLI: `zentinelle-agent install | proxy | status | uninstall | install-skill`

Two modes:
- **Hooks** (Claude Code only): PreToolUse → `/evaluate` (can block), PostToolUse → `/events` (audit)
- **Proxy** (all agents): `zentinelle-agent proxy --provider <anthropic|openai|google>`

## Policy Evaluators

All evaluators live in `zentinelle/services/evaluators/`. The policy engine runs all matching policies on every evaluate call.

| Evaluator | Config keys | What it checks |
|-----------|------------|----------------|
| `RateLimitEvaluator` | `requests_per_minute`, `requests_per_hour`, `tokens_per_day` | Redis-backed sliding window counters |
| `ToolPermissionEvaluator` | `denied_tools`, `allowed_tools`, `requires_approval` | Tool name from `context.tool` or `context.tool_name` |
| `ModelRestrictionEvaluator` | `allowed_models`, `allowed_providers`, `blocked_models`, `blocked_providers` | Model/provider from context |
| `AgentCapabilityEvaluator` | `allowed_actions`, `denied_actions`, `require_approval` | fnmatch patterns on action string |
| `NetworkPolicyEvaluator` | `allowed_domains`, `blocked_domains`, `allowed_ips`, `blocked_ips` | Domain/IP from context |
| `OutputFilterEvaluator` | patterns, rules | Scans LLM response content |
| `SecretAccessEvaluator` | `allowed_bundles`, `denied_providers` | Bundle slug and provider from context |

Cache invalidation: versioned cache keys. Policy CRUD mutations bump version, next evaluate call misses cache and re-queries.

## Policy Actions (#396)

Policies and content rules share one ordered action set. A rule names what
happens when it matches:

| Action | What happens |
|---|---|
| `log` | recorded as evidence only |
| `alert` | recorded, and the tenant's owners are notified |
| `warn` | the call goes ahead with a visible warning |
| `steer` | the call goes ahead and the rule's message is injected into the session |
| `redact` | the matched content is removed before it goes on |
| `require_approval` | the call is held until a person approves it |
| `block` | the offending action is stopped, at a block level: `tool_call`, `turn`, `revoke_key`, `stop`, `quarantine` |

The order is `log < alert < warn < steer < redact < require_approval < block`,
and block levels order the blocks. `Policy` and `ContentRule` store `action`,
`block_level`, `steer_message` and `escalation`; the logic is in
`services/actions.py`.

**Deciding.** A match starts at the rule's action. A match that an approval
can release (an evaluator's own approval list) starts no higher than
`require_approval`. Escalation raises it:

```json
{"window_seconds": 3600,
 "repeat": [{"count": 2, "action": "steer"},
            {"count": 3, "action": "block", "block_level": "turn"}],
 "severity": [{"min_severity": "critical", "action": "block", "block_level": "stop"}]}
```

- Repeat steps count this rule's matches for the same endpoint, in a window
  that opens at the first match. Dry runs and after-the-fact scans read the
  count without adding to it.
- Severity steps compare a policy match with the evaluation's risk score
  mapped to severity (the mapping incidents use), and a content-rule match
  with the severity of its detections.
- For a policy, severity escalation is advisory. The risk score reads flags
  the caller declares in `context` (`data_contains_pii`, `is_pii_access`,
  `data_type`, `datasource`), so a caller that leaves them out keeps the
  score low. Anything that must hold belongs in the rule's own action or in
  repeat steps, which Zentinelle counts itself.
- Steps only go up. Saving refuses a step that is not stronger than the one
  before it, and a rule that can steer but has no message.

A rule that cannot be evaluated fails closed: a stored selector that cannot
be read, or an evaluator that raises. Neither says whether the rule matched,
so the rule's action does not apply. Under enforce the call is refused
(`block` at `tool_call`) whatever the action, as every failure was before
#396. Under audit it is recorded as `log`. It is never escalated or released
by an approval.

A policy's mode (`enforcement`) is the ceiling. `enforce` allows every action.
`audit` performs only the `log` and `alert` steps the rule reached and records
the rest as `log`, with `capped_from` saying what it would have done.
`disabled` rules are not evaluated. Content rules have no mode; `enabled`
turns them on and off.

Steer templates take `{rule}`, `{reason}`, `{action}`, `{tool}` and `{agent}`,
and nothing else. `{tool}` and `{reason}` carry what the caller sent into a
message the harness trusts, so every value goes in as one quoted line:
control characters, line breaks and format characters (bidi overrides, zero
widths) become spaces, quotes inside it are escaped, and it is cut at 200
characters.

**Existing rules.** Migration 0062 gave every policy `block` at `tool_call`,
which is what an enforced failure did before. Audit policies keep `block` too:
the audit ceiling records them as `log`, and switching one to enforce blocks
as it always did. Content rules moved value for value, with `log_only`
becoming `log`. `test_action_equivalence.py` runs a fixture set of existing
rules through the real migration and then `/evaluate`, the engine and `/scan`,
and compares everything they produce with a golden file recorded before the
change.

**Rolling deploys.** The backend migrates at startup while the previous
release's tasks still serve, so 0062 leaves that release working:

- `ContentRule.enforcement` stays, written from `action` on every save as the
  nearest legacy value, because the old models read it on every rule lookup.
  #416 drops it once no environment runs, or could roll back to, the old
  release.
- The new `Policy` columns and `ContentScan.enforcement` have database
  defaults, so an old pod's policy create and `/scan` still insert. A policy
  it creates takes `block` at `tool_call`, which is what it meant.
- The new content-rule columns have no database default on purpose. An old
  pod has no working way to create a rule (#407), and one without an action
  would read as `log`.

### The evaluate contract

`POST /api/zentinelle/v1/evaluate` may carry `target_capabilities`, an object
of booleans saying what the caller can honour:

| Capability | Honours |
|---|---|
| `supports_steer` | `steer` |
| `supports_redact` | `redact` |
| `supports_approval` | `require_approval` (holding the call) |
| `supports_interrupt` | `block` at `turn` |
| `supports_revoke_key` | `block` at `revoke_key` |
| `supports_stop` | `block` at `stop` |
| `supports_quarantine` | `block` at `quarantine` |

Other names are ignored, and a value that is not a boolean is a 400. It is
kept out of `context`, so it never changes an approval's digest.

Every response, including the 503 for a policy outage, carries `enforcement`:

```json
"enforcement": {
  "action": "block", "block_level": "turn", "message": null,
  "rule": {"type": "policy", "id": "...", "name": "No rm", "version": 3},
  "mode": "enforce", "configured_action": "warn",
  "escalation": {"by": "repeat", "count": 3, "window_seconds": 3600},
  "capped_from": null,
  "fallback_chain": [
    {"action": "block", "block_level": "turn", "requires": "supports_interrupt"},
    {"action": "block", "block_level": "revoke_key", "requires": "supports_revoke_key"},
    {"action": "block", "block_level": "stop", "requires": "supports_stop"},
    {"action": "block", "block_level": "quarantine", "requires": "supports_quarantine"},
    {"action": "block", "block_level": "tool_call", "requires": null}],
  "selected": {"action": "block", "block_level": "revoke_key", "requires": "supports_revoke_key"},
  "fallback": true
}
```

- `action` is the strongest decision across the matched rules, and `null` when
  nothing matched. `rule` is the rule that decided it; it is `null` when a
  budget admission, bad input or an outage refused the call. Each
  `policies_evaluated` entry carries its own `action` and `block_level`.
- `fallback_chain` is what to try, in order. A block falls back upward through
  the stronger levels, then to refusing the call; steer falls back to warn;
  redact and approval fall back to refusing the call. Every chain ends with an
  option any caller can honour (`requires: null`).
- `selected` and `fallback` are set when the request carried
  `target_capabilities`: the first option the target can honour, and whether
  it is not the first. Without capabilities the caller picks from the chain.
- `allowed` and `decision` stay the floor for callers that read nothing else.
  `block`, `require_approval` and `redact` deny (an agent host still gets
  `ask` for approval), and `log`, `alert`, `warn` and `steer` allow. Warn and
  steer also add `[Warn]` and `[Steer]` lines to `warnings`, so an older
  caller still shows them. What a caller declares never changes `allowed`.
- No policy evaluator returns redacted content, so `/evaluate` has nothing a
  target could pass on in place of the original: for a redact decision,
  `selected` falls back to refusing the call even when the target declared
  `supports_redact`. Redaction a target can honour comes from `/scan`.
- The evaluation event's payload carries the same `enforcement`. An allowed
  call decided as `alert` is filed in the alert category.

`POST /api/zentinelle/v1/scan` takes the same `target_capabilities` and returns
the same `enforcement` for content rules, with `redacted_content` inside it
when the decision is `redact`; the decision is stored on the `ContentScan`.
The legacy `action` and `allowed` keep their old precedence (block, then warn,
then redact; `log`, `alert` and `require_approval` change nothing there), so
for a caller reading only `action` a warn rule still wins over a redact rule,
and a `require_approval` rule holds nothing (#408). A rule that escalation
raises into `require_approval` reads as `block` there instead: a legacy
caller cannot hold a call, and escalating must not undo the warn or redact the
rule applied before it.

Delivering a steer or a stop to a running agent is the target's job
(Astrolift: #394, calliopeai/astrolift-app#1903).

## Astrolift Integration

Astrolift runs agent workloads; Zentinelle governs them. Both sides need the
same identity and the same URLs, so the contract is fixed here.

### agent_id is the Astrolift deployment slug

Astrolift sets `agent_id` to its deployment slug when calling
`POST /api/zentinelle/v1/register`. The slug is already unique, stable and
human readable on the Astrolift side, and `agent_id` is a SlugField, so the
slug is the correlation id. Neither side stores a foreign key, and deeplinks
are constructable without a round trip.

The alternative, Zentinelle minting a UUID that Astrolift stores as a pod
label, was rejected: it adds state Astrolift has to manage and makes every
deeplink require a lookup first.

Two consequences the implementation has to honour:

- **agent_id is unique per tenant, not globally.** The model constrains
  `('tenant_id', 'agent_id')`. Never look one up without a tenant filter: it
  lets one tenant's slug block another's, and a 409 discloses that a slug is
  taken in an account the caller cannot see.
- **Register is idempotent.** A redeploy reuses the slug, so re-registering
  updates the existing agent and returns `200` rather than `409`. It mints a
  fresh API key, because registration is the only time the plaintext key
  exists and the new workload needs one. Existing `config` is preserved, since
  it may have been tuned since first registration.

### Deeplink URL convention

Astrolift builds these from `agent_id` alone. They are load-bearing; do not
rename them.

```
/agents/{agent_id}/activity       policy evals, content scans, blocked requests
/agents/{agent_id}/interactions   full InteractionLog
/agents/{agent_id}/usage          token burn and cost
/agents/{agent_id}/compliance     violations mapped to this agent
/governance                       governance landing, Astrolift SECURE entry
/risk                             risk register (redirects to /risks)
```

`/agents/{agent_id}` redirects to the activity tab.

### Integration card endpoint

```
GET /api/zentinelle/v1/agent/{agent_id}/summary
Authorization: Bearer sk_service_...
```

Feeds the "Powered by Zentinelle" card in Astrolift's OBSERVE > Agents panel:
status, health, last event, 24h violations, effective policy count, today's
token burn by provider, and enabled compliance frameworks. Cached 60s; the
card is glanceable, not authoritative.

`agent_id` is always resolved inside the key's tenant, so another tenant's
slug returns 404, indistinguishable from one that does not exist.

### Auth (spike outcome, #211)

Three options were on the table: a service API key, an Astrolift
`TenantResolver` implementation, and shared OIDC SSO.

**Decision: service key now for backend-to-backend, OIDC later for portal
links.** The service key is `key_type=service` on the existing `APIKey` model,
carries its own `sk_service_` prefix so it can never be confused with a user
or agent key in a log, and authenticates on the `Bearer` header. It is
tenant-scoped by construction: the key names the tenant, and every view scopes
its queries by it.

`IsServiceKey` deliberately does not honour `AUTH_MODE=open`. With no key
there is no tenant, and a view that cannot name its tenant must not return
rows.

The `TenantResolver` route was rejected for now: it only pays off if
Zentinelle ends up embedded in Astrolift's Django process, and it couples the
two services tightly for no gain while they stay separate. Portal SSO stays
open; deeplinks currently land on Zentinelle's own auth.

### Connected installs and clusters (#389)

The Go gateway runs inside each Astrolift cluster as a data plane, and
Zentinelle is the control plane for one or many of them. Astrolift connects
itself, and nobody copies a gateway credential by hand:

1. A Zentinelle admin generates a one-time **enrollment code** (Settings >
   Astrolift, or `manage.py astrolift_enrollment_code --tenant <id>`). It is
   scoped to tenants (the admin's own by default), works once, and expires
   after 15 minutes (at most 60). Only its SHA-256 is stored. The code carries
   192 random bits, so a fast hash costs nothing, and it lets a single
   conditional UPDATE consume the code, which keeps it single use under a
   race.
2. The Astrolift admin pastes this Zentinelle's URL and the code into Astrolift,
   which calls `POST /api/zentinelle/v1/astrolift/connect`
   `{"code", "install": {"base_url", "name"}}`. That creates an
   `AstroliftInstall` for the code's tenants and returns the install's
   credential (`sk_astroinst_...`, bcrypt-hashed) once. An unknown, expired or
   used code gets the same `400 invalid_enrollment_code`. Lost the response?
   Disconnect the orphan and generate a new code.
3. With `Authorization: Bearer sk_astroinst_...`, Astrolift registers each
   cluster: `POST .../astrolift/clusters` `{"cluster_id", "provider", "region",
   "tenant_ids"?}`. `cluster_id` is Astrolift's id for the cluster and the
   gateway's `ZENTINELLE_CLUSTER_ID`. `tenant_ids` may narrow the install's
   scope, never widen it. The response carries the gateway's
   `GatewayCredential` once. Astrolift writes it into the cluster's Secret and
   no human sees it. Registering a live cluster again mints a fresh credential,
   so an installer that lost one can always register.
4. `POST .../astrolift/clusters/<cluster_id>/rotate` `{"overlap_seconds"}`
   mints the next credential. The earlier ones keep working for the overlap
   (default 600, 0 to 86400), then expire (`GatewayCredential.expires_at`).
   The gateway rereads its credential file only when it is refused, so an
   overlap longer than Secret propagation switches it over with no failed
   request. An overlap of 0 is for a leaked credential.
5. `DELETE .../astrolift/clusters/<cluster_id>` revokes the cluster and its
   gateway registration. `DELETE .../astrolift/install` disconnects the
   install: its credential, its clusters and their gateways. Revoked rows
   stay as history. The same cluster id registered again is a new row with a
   new registration, which is also how a leaked gateway is recovered. To stop
   an install from registering anything, disconnect it.
6. The gateway reports `POST .../astrolift/clusters/<cluster_id>/heartbeat`
   with `X-Zentinelle-Gateway-Credential`: `{"status": healthy|degraded|
   unhealthy, "version", "counters": {"requests", "blocked", "agents_seen"}}`.
   Counters are running totals since the gateway started; unknown counters
   are dropped. The answer asks for the next heartbeat in 60 seconds. A cluster
   that hasn't reported yet is `pending`, and one silent for five minutes is
   `stale`. The gateway sends it whenever `ZENTINELLE_CLUSTER_ID` and its
   credential are set (`HEARTBEAT_INTERVAL_SECONDS=0` turns it off), judges
   its status from its own calls to Zentinelle since the last beat, and after
   a 404 sends nothing until its credential file changes (#391).

The portal (admins only) lists the installs serving the admin's tenant with
their clusters, and can revoke a cluster or disconnect an install. A change
that touches an install needs access to every tenant the install serves.

Every change writes one `AuditLog` record per tenant in scope (actions
`astrolift.*`), so each tenant's chain shows what touched it. No record holds a
code or a credential. Heartbeats are telemetry and are not audited.

An operator's registration from `manage.py gateway_credential register
--cluster <id>` is adopted by the Astrolift cluster with that id only when it
is the one live, unlinked registration for that id and every tenant it serves
is within the cluster's scope. A matching string alone proves nothing, since
cluster ids are not namespaced per install. Its old credentials overlap like a
rotation. Revoking an Astrolift gateway with `gateway_credential revoke`
revokes its cluster too.

Not yet: filtering usage, audit and policy reads by Astrolift project and team
scopes, which needs those ids on events (#390), and counters per gateway
replica: every replica reports for its cluster and the latest heartbeat wins.

## Wiki

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)
