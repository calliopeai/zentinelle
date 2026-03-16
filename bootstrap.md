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
├── gemini.md             # Gemini shim
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

### Fail-Open by Default
If Zentinelle is unreachable, agents continue running. Circuit breaker in SDK. Set `fail_open: false` per policy for hard enforcement.

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
| `Policy` | `scope_type`, `policy_type`, `config`, `tenant_id`, `enabled`, `enforcement` | `enforcement`: enforce, audit, disabled. `scope_type` = target, not location |
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

```
Agent SDK → local proxy (port 8742) → Zentinelle /proxy/<provider>/ → provider API
             (injects X-Zentinelle-Key)   (policy evaluation)
```

| Provider | Upstream | Agent env var |
|----------|----------|---------------|
| `anthropic` | api.anthropic.com | `ANTHROPIC_BASE_URL` |
| `openai` | api.openai.com/v1 | `OPENAI_BASE_URL` |
| `google` | generativelanguage.googleapis.com | `GOOGLE_GEMINI_BASE_URL` |

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

## Wiki

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)
