# Development Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Docker + Docker Compose | latest | Easiest way to run the full stack |
| Python | 3.12+ | Containers ship 3.12-slim; `Pipfile` declares 3.14 for local dev |
| Node.js | 20+ | Frontend builds against `node:20-alpine` |
| Go | 1.22+ | Required for the LLM gateway |
| PostgreSQL | 16+ | Bundled in `docker-compose.yml`, otherwise install locally |
| Redis | 7+ | Required for Celery, rate limits, session quotas |

## Repository Layout

```
zentinelle.git/
├── backend/                Django 5 backend
│   └── zentinelle/
│       ├── api/views/      REST views (assistant.py, evaluate.py, events.py, ...)
│       ├── auth/           Pluggable auth (open / local / sso)
│       ├── clickhouse/     Optional analytics store
│       ├── management/commands/   CLI entry points (bootstrap_token, generate_secrets, ...)
│       ├── models/         Tenant-scoped models (policy, risk, compliance, ...)
│       ├── proxy/          Provider proxies for LLM calls routed through Django
│       ├── schema/         Strawberry GraphQL schema
│       ├── services/       Policy engine, evaluators, content scanner, alerts
│       └── tasks/          Celery tasks (events, billing, compliance_monitoring)
├── frontend/               Next.js 16 GRC portal (TypeScript, Apollo)
│   └── app/
│       ├── (app)/          Authenticated app routes (agents, policies, compliance, ...)
│       ├── (login)/        Auth flows
│       ├── api/            Next.js route handlers (proxy + assistant)
│       └── actions/        Server actions
├── gateway/                Go LLM sidecar (:8742) — see gateway/README.md
├── scripts/                Development scripts (demo_agent.py, codemap.py, kf.py)
├── docker/                 init.sql, nginx.conf
├── docs/wiki/              MkDocs Material source for zentinelle.dev
├── docker-compose.yml      8-service stack (postgres, redis, backend, celery × 2, nginx, frontend, gateway)
└── Makefile                Common dev commands
```

## Quick Start (Docker Compose)

```bash
git clone https://github.com/calliopeai/zentinelle.git
cd zentinelle
cp .env.example .env
docker compose up -d
```

Defaults to `AUTH_MODE=open` so no login is required. Open http://localhost:8080 — you're in the portal as admin.

Services and ports:

| Service | URL | Notes |
|---------|-----|-------|
| Portal | http://localhost:8080 | Nginx → Next.js + Django |
| GraphQL | http://localhost:8080/gql/zentinelle/ | Management API |
| REST API | http://localhost:8080/api/zentinelle/v1/ | Agent-facing |
| Admin | http://localhost:8080/admin/ | Django admin |
| LLM Gateway | http://localhost:8742 | Go sidecar |

To register an agent you need a bootstrap token:

```bash
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "default tenant"
```

## Local Dev (No Docker)

### Backend

```bash
cd backend
pipenv install
cp ../.env.example .env
pipenv run python manage.py migrate
pipenv run python manage.py createsuperuser
pipenv run python manage.py runserver 0.0.0.0:8000
```

Background workers (separate terminals):

```bash
cd backend
pipenv run celery -A config worker -l info       # event processing
pipenv run celery -A config beat -l info         # periodic tasks (baselines, retention, monitoring)
```

### Frontend

```bash
cd frontend
npm install
npm run dev                                       # http://localhost:3002
```

### Gateway

```bash
cd gateway
go build -o zentinelle-gateway .
ZENTINELLE_URL=http://localhost:8000 ./zentinelle-gateway
```

## Run Real Agents

`scripts/demo_agent.py` registers a real agent against a running Zentinelle, sends events, evaluates policies, and heartbeats — perfect for validating end-to-end before integrating real workloads.

```bash
# 1. Generate a bootstrap token (default tenant)
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "demo"

# 2. Run the demo agent
ZENTINELLE_URL=http://localhost:8080 \
ZENTINELLE_BOOTSTRAP_TOKEN=bt_00000000-0000-0000-0000-000000000001_... \
python scripts/demo_agent.py
```

While it runs, watch the agent appear at http://localhost:8080/agents, events stream to `/events`, and policy evaluations land in `/audit-logs`.

The script imports the SDK from a sibling checkout of `zentinelle-sdk.git/python/`. If you don't have one, install the published package:

```bash
pip install zentinelle
```

## Management Commands

All commands run via `python manage.py <command>` (or `docker compose exec backend python manage.py ...`). Source: `backend/zentinelle/management/commands/`.

| Command | Purpose |
|---------|---------|
| `bootstrap_token generate <tenant_id>` | Mint an HMAC-signed agent registration token |
| `bootstrap_token list [tenant_id]` | List active tokens |
| `bootstrap_token revoke <token_prefix>` | Revoke a token |
| `generate_secrets` | Print fresh `SECRET_KEY`, `ZENTINELLE_SECRET_KEY`, `ZENTINELLE_BOOTSTRAP_SECRET` |
| `setup_sentinel` | Load AI provider fixtures and configure periodic tasks |
| `seed_demo` | Create demo tenant, agents, policies, risks, incidents, and events |
| `seed_models` | Seed `AIModel` registry from `MODEL_FIXTURES` |
| `sync_models [provider]` | Pull live model lists from provider APIs |
| `seed_prompt_library` | Seed the system prompt library |
| `activate_compliance_pack <pack> --tenant <id>` | Provision a baseline policy bundle (hipaa, soc2, ...) |
| `policy_apply / policy_diff / policy_validate / policy_export` | Policy-as-code workflow |
| `create_junohub_endpoint` | Provision a Calliope-managed JunoHub endpoint |
| `generate_offline_license` | Issue an offline license file |

Run any command with `--help` for full options.

## Building the Go Gateway

```bash
cd gateway
go build -o zentinelle-gateway .
go test ./...
```

The gateway is a single static binary. It detects provider from the request path (`/v1/chat/completions` → OpenAI, `/v1/messages` → Anthropic, `/v1beta/models/*` → Google), calls Zentinelle `/api/zentinelle/v1/evaluate` for the policy decision, injects the real provider key on success, and streams the response back. SSE-aware. See `gateway/README.md` for full env-var reference.

Docker build:

```bash
docker build -t zentinelle-gateway gateway/
```

## Database Schemas

Zentinelle ships with two PostgreSQL schemas managed by `backend/zentinelle/db_router.py`:

| Schema | Contents | Purpose |
|--------|----------|---------|
| `public` | Django auth + sessions | Framework tables |
| `zentinelle` | Agents, policies, events, risks, incidents, compliance | Core GRC data |
| `zentinelle_analytics` | `UsageMetric`, `UsageAggregate`, `AuditLog` | High-volume analytics |

All schemas live in the same database by default. The analytics schema can be split off (or replaced with ClickHouse via `CLICKHOUSE_URL`) without touching the core schema.

## Auth Modes

`AUTH_MODE` is set in `.env` and picked up by `backend/config/settings/base.py`.

| Mode | Behaviour |
|------|-----------|
| `open` | No login required. Every request is admin. **Internal/dev only** — `prod.py` rejects startup if used. |
| `local` | Built-in username/password with session cookies. Django auth + sessions. |
| `sso` | OIDC/SAML through any provider (Google, Okta, Cognito, Entra ID, Keycloak). Requires `OIDC_*` env vars. |

Backwards compatibility: `standalone` is an alias for `local`.

In production:
- `SECRET_KEY`, `ZENTINELLE_SECRET_KEY`, `ZENTINELLE_BOOTSTRAP_SECRET` must be set or startup fails.
- `AUTH_MODE=open` is rejected.
- HSTS, secure cookies, CORS allowlist, and `X-Frame-Options: DENY` are enforced automatically.

Generate fresh secrets with `python manage.py generate_secrets`.

## Testing

```bash
cd backend
pipenv run pytest                                   # all tests
pipenv run pytest zentinelle/tests/                # zentinelle only
pipenv run pytest zentinelle/tests/test_policy_engine.py
pipenv run pytest -x                               # stop on first failure
pipenv run pytest --cov=zentinelle                 # with coverage
```

## Pre-Commit Validation

Run before every backend commit. **Stop and fix on any failure** — don't commit past a halt.

```bash
cd backend

# 1. Django startup — catches schema ordering and import errors
pipenv run python -c \
  "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# 2. Migration check — catches unapplied model changes
pipenv run python manage.py makemigrations --check --dry-run

# 3. Tests
pipenv run pytest

# 4. Lint
pipenv run flake8
pipenv run isort --check-only .
```

## GraphQL Workflow

Zentinelle exposes a single GraphQL endpoint at `POST /gql/zentinelle/` (see [api.md](api.md)).

```bash
# 1. Modify schema in backend/zentinelle/schema/
# 2. Export schema file
cd backend && pipenv run python manage.py dev_utils --generate_schema
# 3. Regenerate TypeScript types (frontend must have backend running)
cd frontend && npm run compile
```

### Schema Ordering Rule

**Critical:** define types in this exact order in every schema file. Forward references crash Django startup silently.

1. Imports
2. Enums and InputTypes
3. ObjectTypes
4. Result types (`*Result`, `*Connection`)
5. Query class
6. Mutation class

## Migrations

```bash
cd backend
pipenv run python manage.py makemigrations zentinelle    # after model changes
pipenv run python manage.py migrate                       # apply
pipenv run python manage.py showmigrations                # check
```

All Zentinelle models live in the `zentinelle` schema (via DB router). Migrations live in `zentinelle/migrations/`. Analytics models route to `zentinelle_analytics` automatically.

## Adding a New Policy Type

1. Add the type to `Policy.PolicyType` in `backend/zentinelle/models/policy.py`.
2. Implement the evaluator in `backend/zentinelle/services/evaluators/<your_type>.py` (subclass `BasePolicyEvaluator`).
3. Wire it into `backend/zentinelle/services/policy_engine.py` (the `_evaluators` dict).
4. Export from `backend/zentinelle/services/evaluators/__init__.py`.
5. Add GraphQL types in `backend/zentinelle/schema/types/policy.py` and mutations in `schema/mutations/policy.py`.
6. Add a config snippet to the simulator UI defaults in `frontend/app/(app)/policies/simulator/page.tsx`.
7. Add it to `ALL_POLICY_TYPES` in `frontend/app/(app)/policies/analyzer/page.tsx`.
8. Update `docs/wiki/policies.md` with the new policy block.
9. Write tests in `backend/zentinelle/tests/test_policy_engine.py`.

## Adding a New REST Endpoint

1. Create a view in `backend/zentinelle/api/views/`.
2. Register the URL in `backend/zentinelle/api/urls.py`.
3. Use `TenantResolver` middleware for tenant scoping. Always filter querysets by `tenant_id`.
4. Write tests under `backend/zentinelle/tests/`.
5. Update `docs/wiki/api.md`.

## Adding an SDK Framework Plugin

Plugins live in the sibling repo `zentinelle-sdk.git/`. Each plugin:

1. Wraps the core SDK client.
2. Intercepts the framework's LLM calls.
3. Calls `evaluate()` before and `emit()` after.
4. Handles errors gracefully — never break the agent.

See the LangChain plugin in `zentinelle-sdk.git/python/zentinelle/plugins/langchain/` for the reference implementation.

## Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| GraphQL ObjectType | `<Entity>Type` | `PolicyType`, `AgentEndpointType` |
| GraphQL Mutation | `<Verb><Entity>` | `CreatePolicy`, `UpdateAgentEndpoint` |
| GraphQL Query class | `<Domain>Query` | `PolicyQuery`, `AgentQuery` |
| REST view | `<Entity>View` | `EvaluateView`, `RegisterView` |
| Service | `<Domain>Service` or `<Domain>Engine` | `PolicyEngine`, `ContentScannerService` |
| Celery task | `<verb>_<entity>` | `process_events`, `generate_compliance_report` |

## Common Field Names

| Model | Correct | Wrong |
|-------|---------|-------|
| `AgentEndpoint` | `agent_id` (slug) | `endpoint_id` |
| `Policy` | `scope_type` | `target_type` |
| `AgentEndpoint` | `api_key_hash` + `api_key_prefix` | `api_key` (never stored) |
| All models | `tenant_id` (string) | `organization_id`, `org_fk` |

## Git Workflow

- No co-authorship messages in commits.
- No rebases or force-pushes.
- Commit directly to `main`.
- Don't push to remote unless explicitly asked.
