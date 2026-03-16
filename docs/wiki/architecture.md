# Architecture

## System Overview

Zentinelle is a Django 5.0 backend with a Next.js 14 management portal. Agents connect via a REST API. Admins manage policies and view dashboards via GraphQL.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Zentinelle Service                           │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  REST API  /api/zentinelle/                                  │   │
│  │  register · evaluate · config · events · heartbeat · secrets │   │
│  └───────────────────────┬──────────────────────────────────────┘   │
│                          │                                           │
│  ┌───────────────────────▼──────────────────────────────────────┐   │
│  │  Policy Engine                                               │   │
│  │  scope resolution · rule evaluation · cost metering          │   │
│  └───────────────────────┬──────────────────────────────────────┘   │
│                          │                                           │
│  ┌───────────┬───────────▼───────────┬──────────────────────────┐   │
│  │ Event     │  Content Scanner      │  Compliance Engine        │   │
│  │ Store     │  PII · toxicity ·     │  SOC2 · GDPR · HIPAA ·   │   │
│  │           │  jailbreak            │  EU AI Act · NIST RMF     │   │
│  └───────────┴───────────────────────┴──────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GraphQL  /gql/zentinelle/                                   │   │
│  │  policies · dashboards · audit · risk · incidents            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  GRC Portal (Next.js 14, port 3002)                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │                                          │
         │ callout                                  │ DB
         ▼                                          ▼
┌──────────────────┐                    ┌──────────────────────┐
│  Client Cove     │                    │  PostgreSQL           │
│  /internal/      │                    │  schema: zentinelle   │
│  zentinelle/     │                    └──────────────────────┘
│  (auth/tenant)   │
└──────────────────┘
```

## Backend (Django 5.0)

### Django Apps

| App | Purpose |
|-----|---------|
| `zentinelle` | Core app — all GRC models, API, GraphQL, services, tasks |
| `config` | Django project — settings, URL routing, WSGI/ASGI |

### Zentinelle App Structure

```
zentinelle/
├── models/
│   ├── agent.py          # AgentEndpoint
│   ├── policy.py         # Policy, PolicyVersion
│   ├── event.py          # Event (high-volume telemetry)
│   ├── content.py        # ContentScan, ContentRule
│   ├── audit.py          # InteractionLog (full request/response)
│   ├── prompt.py         # SystemPrompt (versioned library)
│   ├── risk.py           # Risk, Incident
│   ├── compliance.py     # ComplianceReport, ControlMapping
│   └── license.py        # ZentinelleLicense, AgentEntitlement
├── api/                  # REST endpoints (agent-facing)
│   ├── register.py
│   ├── evaluate.py
│   ├── config.py
│   ├── events.py
│   ├── heartbeat.py
│   └── secrets.py
├── schema/               # GraphQL (management portal)
│   ├── types/
│   ├── queries/
│   └── mutations/
├── services/
│   ├── policy_engine.py  # Core evaluation logic
│   ├── content_scanner.py
│   ├── cost_meter.py     # Per-provider token cost calculation
│   └── compliance.py     # Framework mapping and reporting
├── tasks/                # Celery async tasks
│   ├── events.py         # Event processing, aggregation
│   ├── compliance.py     # Periodic compliance checks
│   └── alerts.py         # Anomaly detection, notification routing
├── auth/
│   ├── resolver.py       # TenantResolver interface
│   └── client_cove.py    # ClientCoveTenantResolver implementation
└── db_router.py          # Routes zentinelle models to zentinelle schema
```

## Frontend (Next.js 14)

GRC portal at port 3002, basePath `/zentinelle`.

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/zentinelle/` | Agent health, event rates, active policies |
| Policy Editor | `/zentinelle/policies/` | Create/edit policies, version history |
| Model Registry | `/zentinelle/models/` | LLM model catalog, approval workflow |
| Prompt Library | `/zentinelle/prompts/` | System prompts with versioning |
| Compliance | `/zentinelle/compliance/` | Framework dashboards + report export |
| Content Scanner | `/zentinelle/content/` | Scan results, rule configuration |
| Monitoring | `/zentinelle/monitoring/` | Real-time agent health, event stream |
| Risk | `/zentinelle/risk/` | Risk matrix, incident management |
| Audit | `/zentinelle/audit/` | Full interaction logs, filter + export |

**Stack:** Next.js 14 App Router · Chakra UI / Horizon UI PRO · Apollo Client · GraphQL

**GraphQL workflow:**
1. Modify schema in `backend/zentinelle/schema/`
2. Run `python manage.py dev_utils --generate_schema`
3. Run `npm run compile` in `frontend/` to regenerate TypeScript types

## Database

PostgreSQL, `zentinelle` schema. All models route via `ZentinelleRouter`.

```python
# config/settings/base.py
DATABASES = {
    "default": { ... },
    "zentinelle": {
        **postgres_config,
        "OPTIONS": {"options": "-c search_path=zentinelle"},
    },
}
DATABASE_ROUTERS = ["zentinelle.db_router.ZentinelleRouter"]
```

When running as a fully standalone service (no Client Cove): set `zentinelle` DB alias to a separate database, and change `search_path` back to `public`.

## Caching (Redis)

| Key | TTL | Purpose |
|-----|-----|---------|
| `tenant:{id}` | 5 min | Tenant context from Client Cove callout |
| `auth:{token_hash}` | 60s | Token validation result |
| `config:{agent_id}` | 5 min | Agent config cache (SDK also caches locally) |
| `policy:{tenant_id}` | 2 min | Compiled policy set per tenant |

## Async (Celery)

- **Broker:** Redis
- **Event processing:** Bulk event writes, aggregation, anomaly detection
- **Compliance:** Periodic control checks, report generation
- **Alerts:** Incident creation, notification routing (email, webhook)

## Request Flow

### Agent API Call

```
Agent SDK
  │
  │ POST /api/zentinelle/evaluate
  ▼
nginx → Django (gunicorn)
  │
  ├── Auth middleware: validate JWT → Redis cache → Client Cove callout
  │
  ├── Load tenant policy set (Redis cache → DB)
  │
  ├── Policy engine: evaluate all applicable policies
  │   └── scope resolution: org → team → deployment → endpoint → user
  │
  ├── Content scanner (if content policy present): PII / toxicity / jailbreak
  │
  └── Response: { allowed: bool, reason: str, restrictions: {} }
```

### Management Portal Call

```
GRC Portal (Next.js)
  │
  │ POST /gql/zentinelle/
  ▼
Django GraphQL (Graphene)
  │
  ├── Auth: same JWT validation
  ├── Tenant scoping: all queries filtered by tenant_id
  └── Response: typed GraphQL data
```

## Auth Bridge (Client Cove)

Zentinelle has no user database. Auth is delegated:

```
Zentinelle → POST /internal/zentinelle/auth/validate/ → Client Cove
             ← { tenant_id, user_id, scopes }
```

Service-to-service auth via shared secret (`ZENTINELLE_INTERNAL_TOKEN`). See [#9](https://github.com/calliopeai/zentinelle/issues/9).

## Standalone vs Embedded Modes

| Mode | Auth | Tenant resolution | Use case |
|------|------|------------------|----------|
| Standalone | Client Cove callout or custom resolver | `ClientCoveTenantResolver` or pluggable | Self-hosted, BYOC, managed cloud |
| Embedded (Client Cove sentinel) | Shared Django auth | Direct ORM access | Internal Calliope AI agent governance |

The `TenantResolver` interface is the seam — swap the implementation to change auth source.
