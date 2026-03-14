# CLAUDE.md — Zentinelle

Zentinelle is a standalone, MIT-licensed AI agent GRC (Governance, Risk, Compliance) platform. It is a companion product to Calliope AI but sold and deployed independently.

**GitHub:** https://github.com/calliopeai/zentinelle
**Issue tracker:** https://github.com/orgs/calliopeai/projects/4
**Related:** [zentinelle-sdk](https://github.com/calliopeai/zentinelle-sdk) · [client-cove](https://github.com/calliopeai/client-cove)

---

## Architecture Overview

```
zentinelle.git/
├── backend/              # Django 5.0 service
│   ├── config/           # Settings, URLs, WSGI/ASGI
│   ├── zentinelle/       # Core Django app (17 subdirs)
│   │   ├── models/       # AgentEndpoint, Policy, Event, ContentScan, etc.
│   │   ├── api/          # REST endpoints (agent-facing)
│   │   ├── schema/       # GraphQL (management portal)
│   │   ├── services/     # Policy engine, content scanner, evaluators
│   │   ├── tasks/        # Celery async tasks
│   │   └── auth/         # TenantResolver, token validation
│   └── Pipfile
├── frontend/             # Next.js 14 GRC portal (port 3002)
│   └── src/
├── docs/wiki/            # Knowledge base (start here)
└── docker-compose.yml
```

**Two API surfaces:**
- `POST /api/zentinelle/*` — REST, agent-facing (register, evaluate, config, events, heartbeat, secrets)
- `GET|POST /gql/zentinelle/` — GraphQL, management portal (CRUD on policies, dashboards, etc.)

## Key Architecture Decisions

### Tenant Model
Zentinelle stores `tenant_id` (opaque string UUID) on every model — never a direct FK to an external User or Organization model. Tenant context is resolved by calling back to Client Cove's internal API.

See: [#9 Auth bridge](https://github.com/calliopeai/zentinelle/issues/9)

### Database
Same PostgreSQL instance as Client Cove (for now), isolated in a `zentinelle` schema via Django DB router. All Zentinelle models live in this schema.

See: [#7 DB schema isolation](https://github.com/calliopeai/zentinelle/issues/7)

### Auth Flow
1. Agent/user presents JWT (Auth0 token)
2. Zentinelle calls `POST /internal/zentinelle/auth/validate/` on Client Cove
3. Gets back `tenant_id`, `user_id`, `scopes`
4. Caches result in Redis (60s TTL)

Tenant context (features, limits) cached at 5min TTL.

### Policy Scope Hierarchy
Policies cascade downward. More specific scope wins.
```
Organization → Team → Deployment → Endpoint → User
```
`Policy.scope_type` defines what the policy applies to, not where it lives.

### Fail-Open by Default
If Zentinelle is unreachable, agents continue running. Circuit breaker in SDK. Configure `fail_open: false` per policy for hard enforcement.

## Common Commands

### Backend
```bash
cd backend
pipenv install
pipenv run python manage.py runserver          # Dev server (port 8000)
pipenv run pytest                              # All tests
pipenv run pytest zentinelle/tests/           # Zentinelle tests only
pipenv run python manage.py migrate
pipenv run python manage.py dev_utils --generate_schema   # Export GraphQL schema
```

### Frontend (GRC Portal)
```bash
cd frontend
npm install
npm run dev          # Dev server (http://localhost:3002)
npm run build
npm run compile      # Regenerate GraphQL types (backend must be running)
npm run lint
```

### Docker (Full Stack)
```bash
docker compose up                              # All services
docker compose run backend python manage.py migrate
docker compose run backend python manage.py createsuperuser
```

## Model Reference

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `AgentEndpoint` | `agent_id` (SlugField), `api_key_hash`, `api_key_prefix`, `tenant_id`, `status`, `health`, `capabilities` | `agent_id` is the external slug, not the UUID `id` |
| `Policy` | `scope_type`, `scope_id`, `policy_type`, `config`, `tenant_id`, `is_active` | `scope_type` = target type, not location |
| `Event` | `agent_endpoint`, `event_type`, `payload`, `tenant_id`, `timestamp` | High volume — write-optimized |
| `ContentScan` | `agent_endpoint`, `scan_type`, `result`, `pii_detected`, `toxicity_score` | |
| `InteractionLog` | `agent_endpoint`, `request`, `response`, `policy_decisions`, `tokens_used`, `cost_usd` | Full audit trail |
| `SystemPrompt` | `name`, `content`, `version`, `tenant_id` | Versioned prompt library |
| `Risk` | `title`, `likelihood`, `impact`, `status`, `tenant_id` | 5x5 matrix |
| `Incident` | `risk`, `severity`, `status`, `timeline` | Linked to risks |

### Critical Field Names (common mistakes)

| Model | Correct | Wrong |
|-------|---------|-------|
| `AgentEndpoint` | `agent_id` (slug) | `endpoint_id` |
| `Policy` | `scope_type` | `target_type` |
| `AgentEndpoint` | `api_key_hash` + `api_key_prefix` | `api_key` |

## GraphQL Schema Ordering Rule

**ALL ObjectType/InputType classes MUST be defined BEFORE any Query or Mutation class that uses them.** Python evaluates class bodies at import time — forward references cause `NameError` and crash startup.

Order in every schema file:
1. Imports
2. Enums and InputTypes
3. ObjectTypes
4. Result types (`*Result`, `*Connection`)
5. Query classes
6. Mutation classes

## Naming Conventions

| Pattern | Convention | Example |
|---------|-----------|---------|
| GraphQL ObjectType | `<Entity>Type` | `PolicyType`, `AgentEndpointType` |
| GraphQL Mutation | `<Verb><Entity>` | `CreatePolicy`, `RegisterAgent` |
| REST API response | snake_case JSON | `{"agent_id": "...", "api_key": "..."}` |
| Tenant reference | `tenant_id` | always opaque string, never FK |

## Validation Checklist

Run before committing backend changes:
```bash
# Django startup check
cd backend && pipenv run python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# Migration check
pipenv run python manage.py makemigrations --check --dry-run

# Tests
pipenv run pytest
```

## Git Workflow

- No co-authorship messages in commits
- No rebasing, no force-push
- Commit directly to `main`

## Related Docs

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)
