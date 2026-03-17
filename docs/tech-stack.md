
# Tech Stack

## Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Django 5.0 | REST API, ORM, admin |
| API | Django REST Framework | Agent-facing REST endpoints |
| GraphQL | Graphene-Django | Management portal API |
| Task queue | Celery + Celery Beat | Async event processing, scheduled compliance checks |
| Cache | Redis | Policy cache, rate limit counters, session store |
| Database | PostgreSQL | Primary data store, isolated `zentinelle` schema |
| Analytics | ClickHouse | Audit log analytics (optional) |

### Key backend modules

```
backend/zentinelle/
├── api/views/         # REST endpoints: evaluate, events, register, heartbeat
├── proxy/views.py     # LLM proxy: transparent passthrough with policy enforcement
├── schema/            # GraphQL types, queries, mutations
├── services/
│   ├── policy_engine.py    # Core: evaluates all policies with scope inheritance
│   └── evaluators/         # 22 policy evaluators (rate_limit, tool_permission, etc.)
├── models/            # AgentEndpoint, Policy, Event, InteractionLog, ContentScan
├── tasks/             # Celery: event processing, compliance monitoring
└── auth/              # TenantResolver interface (standalone + managed modes)
```

## Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Next.js 14 (App Router) | GRC management portal |
| UI library | Chakra UI | Component system |
| GraphQL client | Apollo Client | Data fetching |
| Charts | Recharts | Dashboard visualizations |

### Portal routes

| Route | Page |
|-------|------|
| `/zentinelle/agents/` | Agent list + registration |
| `/zentinelle/monitoring/` | Live activity, content scanner, anomalies, alerts |
| `/zentinelle/agent-groups/` | Agent grouping for policy scoping |
| `/zentinelle/policies/` | Policy CRUD |
| `/zentinelle/compliance/` | Framework dashboards (SOC2, GDPR, etc.) |
| `/zentinelle/risk/` | Risk register + incidents |
| `/zentinelle/prompts/` | System prompt library |
| `/zentinelle/audit-logs/` | Full audit trail |
| `/zentinelle/settings/` | Organization settings, API keys |

## Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Reverse proxy | nginx | Routes `/api/`, `/gql/`, `/proxy/` to backend; `/` to frontend |
| Container orchestration | Docker Compose | Local dev + production-ready |
| SDK | Python (`zentinelle-agent`) | Agent hooks + local proxy CLI |

## Database schema

PostgreSQL with schema isolation:

- `public` schema: Django auth, admin, sessions (standard Django tables)
- `zentinelle` schema: all Zentinelle models (agents, policies, events, scans, compliance)

Routed via `ZentinelleRouter` -- always use `--database=zentinelle` for Zentinelle migrations.

## LLM Proxy providers

| Provider | Upstream URL | Agent env var |
|----------|-------------|---------------|
| `anthropic` | `api.anthropic.com` | `ANTHROPIC_BASE_URL` |
| `openai` | `api.openai.com/v1` | `OPENAI_BASE_URL` |
| `google` | `generativelanguage.googleapis.com` | `GOOGLE_GEMINI_BASE_URL` |
