# Development Guide

## Prerequisites

- Docker + Docker Compose
- Python 3.11+ with `pipenv`
- Node 20+ with `npm`
- PostgreSQL 15+ (or use Docker)
- Redis 7+ (or use Docker)

## Quick Start (Docker)

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env
docker compose up
```

Services available:
- GRC Portal: http://localhost:3002
- API: http://localhost:8000/api/zentinelle/
- GraphQL: http://localhost:8000/gql/zentinelle/

## Local Dev (No Docker)

### Backend

```bash
cd backend
pipenv install
cp ../.env.example .env    # or set env vars
pipenv run python manage.py migrate
pipenv run python manage.py createsuperuser
pipenv run python manage.py runserver       # port 8000
```

In a separate terminal:
```bash
cd backend
pipenv run celery -A config worker -l info  # event processing
pipenv run celery -A config beat -l info    # periodic tasks
```

### Frontend (GRC Portal)

```bash
cd frontend
npm install
npm run dev                                  # http://localhost:3002
```

## Testing

```bash
cd backend
pipenv run pytest                            # all tests
pipenv run pytest zentinelle/tests/         # zentinelle only
pipenv run pytest zentinelle/tests/test_policy_engine.py  # specific file
pipenv run pytest -x                        # stop on first failure
pipenv run pytest --cov=zentinelle          # with coverage
```

## Pre-Commit Validation

Run before every commit:

```bash
cd backend

# 1. Django startup check (catches import errors, forward references)
pipenv run python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# 2. Migration check
pipenv run python manage.py makemigrations --check --dry-run

# 3. Tests
pipenv run pytest

# 4. Lint
pipenv run flake8
pipenv run isort --check-only .
```

## GraphQL Workflow

Zentinelle has one GraphQL endpoint: `POST /gql/zentinelle/`

```bash
# 1. Modify schema in backend/zentinelle/schema/

# 2. Export schema file
cd backend && pipenv run python manage.py dev_utils --generate_schema

# 3. Regenerate TypeScript types (frontend must have backend running)
cd frontend && npm run compile
```

### Schema Ordering Rule

**Critical:** All ObjectType and InputType classes MUST be defined before any Query or Mutation class that references them. Forward references crash Django startup.

Correct order in every schema file:
1. Imports
2. Enums and InputTypes
3. ObjectTypes
4. Result types (`*Result`, `*Connection`)
5. Query class
6. Mutation class

## Migrations

```bash
cd backend

# Create migration after model changes
pipenv run python manage.py makemigrations zentinelle

# Apply migrations
pipenv run python manage.py migrate

# Check for unapplied migrations
pipenv run python manage.py showmigrations
```

All Zentinelle models live in the `zentinelle` schema (via DB router). Migrations are in `zentinelle/migrations/`.

## Adding a New Policy Type

1. Add the policy type to `zentinelle/models/policy.py` (`PolicyType` enum)
2. Implement the evaluator in `zentinelle/services/policy_engine.py`
3. Add GraphQL types in `zentinelle/schema/types/policy.py`
4. Add mutations in `zentinelle/schema/mutations/policy.py`
5. Update `docs/wiki/policies.md` with the new policy config format
6. Write tests in `zentinelle/tests/test_policy_engine.py`

## Adding a New REST Endpoint

1. Create view in `zentinelle/api/`
2. Register URL in `zentinelle/api/urls.py`
3. Add auth middleware (JWT validation via `TenantResolver`)
4. Write tests
5. Update `docs/wiki/api.md`

## Adding an SDK Framework Plugin

Plugins live in `zentinelle-sdk/plugins/`. Each plugin:
1. Wraps the core SDK client
2. Intercepts the framework's LLM calls
3. Calls `evaluate()` before and `emit()` after
4. Handles errors gracefully (never break the agent)

See `zentinelle-sdk/plugins/langchain/` as the reference implementation.

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
| `AgentEndpoint` | `api_key_hash` + `api_key_prefix` | `api_key` |
| All models | `tenant_id` (string) | `organization_id`, `org_fk` |

## Auth in Development

By default in local dev, auth validation uses a mock resolver (`AUTH_MODE=dev`) that accepts any token and assigns it to a test tenant. Set real values in `.env` to test against Client Cove or standalone auth.

## Git Workflow

- No co-authorship messages in commits
- No rebasing
- Commit directly to `main`
