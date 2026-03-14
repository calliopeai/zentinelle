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

**Two API surfaces:**
- `POST /api/zentinelle/*` — REST, agent-facing (register, evaluate, config, events, heartbeat, secrets)
- `POST /gql/zentinelle/` — GraphQL, management portal (policies, dashboards, audit, risk)

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
Every model has `tenant_id` (opaque string). No direct FK to any external User or Organization model. Tenant context is resolved via the `TenantResolver` interface — pluggable, with a default implementation for standalone mode and a managed-deployment implementation for Calliope-hosted instances.

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
pipenv run python manage.py migrate
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
docker compose run backend python manage.py migrate
docker compose run backend python manage.py createsuperuser
```

## Model Reference

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AgentEndpoint` | `agent_id` (SlugField), `api_key_hash`, `api_key_prefix`, `tenant_id`, `status`, `health`, `capabilities` | `agent_id` is external slug, not UUID `id` |
| `Policy` | `scope_type`, `scope_id`, `policy_type`, `config`, `tenant_id`, `is_active` | `scope_type` = target type, not location |
| `Event` | `agent_endpoint`, `event_type`, `payload`, `tenant_id`, `timestamp` | High volume — write-optimized |
| `ContentScan` | `agent_endpoint`, `scan_type`, `result`, `pii_detected`, `toxicity_score` | |
| `InteractionLog` | `agent_endpoint`, `request`, `response`, `policy_decisions`, `tokens_used`, `cost_usd` | Full audit trail |
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

## Wiki

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)
