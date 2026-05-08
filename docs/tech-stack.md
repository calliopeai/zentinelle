
# Tech Stack

## Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Django 5 | REST API, ORM, admin |
| API | Django REST Framework | Agent-facing REST endpoints |
| GraphQL | Strawberry GraphQL | Management portal API |
| Task queue | Celery + Celery Beat | Async event processing, scheduled compliance checks |
| Cache | Redis 7 | Policy cache, rate limit counters, session store |
| Database | PostgreSQL 16 | Primary data store, isolated `zentinelle` + `zentinelle_analytics` schemas |
| Encryption | Fernet (cryptography lib) | LLM provider keys at rest (AES-128 + HMAC-SHA256) |

### Key backend modules

```
backend/zentinelle/
├── api/views/                # REST: evaluate, events, register, heartbeat,
│                             # assistant/chat, settings/llm-providers,
│                             # incidents, audit, reports, ...
├── proxy/views.py            # LLM proxy with policy enforcement
├── schema/                   # GraphQL types, queries, mutations
├── services/
│   ├── policy_engine.py      # Core: evaluates policies with scope inheritance
│   ├── evaluators/           # 24 policy evaluators
│   ├── llm_provider.py       # 24-provider abstraction (Anthropic, OpenAI, ...)
│   ├── llm_model_discovery.py  # Live /models API integration with caching
│   └── audit_chain.py        # Tamper-evident hash-chained audit logs
├── models/                   # AgentEndpoint, Policy, Risk, Incident, Event,
│                             # InteractionLog, AuditLog, LLMProviderKey, ...
├── tasks/                    # Celery: event processing, retention enforcement
└── auth/                     # TenantResolver, OIDC views, RBAC
```

## Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | Next.js 16 (App Router) | GRC management portal |
| UI library | shadcn/ui + Tailwind CSS 4 | Component system, accessible primitives |
| Data fetching | Apollo Client 4 | GraphQL queries + mutations |
| Charts | Recharts | Dashboard visualizations |
| Markdown | react-markdown | AI assistant chat rendering |

### Portal routes

```
Dashboard
├── Governance
│   ├── Agents              — agent registry, health grid, type donut
│   ├── Policies            — policy CRUD + coverage matrix
│   ├── Policy Hierarchy    — visual inheritance tree
│   ├── Effective Policy    — resolve effective policies for an agent/user
│   ├── Policy Simulator    — dry-run against historical events
│   ├── Policy Analyzer     — detect conflicts, coverage gaps
│   ├── Content Rules       — PII/secret/prompt-injection rules
│   ├── Scanner Dashboard   — content violation analytics
│   └── Models              — model registry browser
├── Risk
│   ├── Overview            — risk index gauge, trend, top risks
│   ├── Register            — risk CRUD + 5×5 matrix
│   ├── FMEA Analysis       — Severity × Likelihood × Impact (Fibonacci)
│   ├── Alerts              — acknowledge/resolve/dismiss alerts
│   ├── Incidents           — SLA tracking, root cause, comments
│   └── Reports             — exportable risk reports
├── Compliance
│   ├── Overview            — radar chart, capability coverage
│   ├── Frameworks          — SOC2/GDPR/HIPAA/AI Act/NIST detail pages
│   ├── Gap Analysis        — missing capabilities + remediation
│   └── Reports             — compliance report generation
├── Observability
│   ├── Events              — live event stream
│   ├── Audit Logs          — tamper-evident chain + verify
│   ├── Monitoring          — usage analytics charts
│   └── Anomalies           — 2σ-based detection
├── Tools
│   ├── System Prompts      — prompt library
│   ├── Prompt Builder      — visual template editor
│   ├── Prompt Generator    — guided wizard
│   ├── AI Assistant        — full-page chat
│   └── Token Calculator    — cost estimator
└── Settings
    ├── General             — org settings, notifications
    ├── API Keys            — platform key CRUD
    ├── LLM Providers       — encrypted key storage + per-provider toggle
    ├── Network Policies    — domain/IP allowlists
    └── Data Retention      — TTLs and legal holds
```

## LLM Gateway (Go sidecar)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Go 1.22, stdlib only | Zero external dependencies |
| Binary size | < 15 MB | Multi-stage Docker build |
| Streaming | http.Flusher | SSE chunk forwarding |
| Auth model | Tenant-scoped key injection | Agent never sees provider keys |
| Scaling | N+1 stateless | Any instance can handle any request |

Sits at `:8742`, intercepts agent traffic, evaluates policy via Zentinelle backend, forwards upstream with the real provider key. Docs: `gateway/ARCHITECTURE.md`.

## Infrastructure

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Reverse proxy | nginx | Routes `/api/`, `/gql/`, `/proxy/`, `/gateway/` |
| Container orchestration | Docker Compose | Local dev + small production |
| Multi-cloud IaC | Terraform | AWS (ECS/EKS), GCP (Cloud Run/GKE), Azure (Container Apps/AKS) |
| SDK | Python, TypeScript, Go, Java, C# | All aligned to same service contract |

## Database schema

PostgreSQL 16 with schema isolation:

- `public` schema: Django auth, admin, sessions
- `zentinelle` schema: agents, policies, risks, incidents, content rules, LLM keys, …
- `zentinelle_analytics` schema: audit logs (tamper-evident chain), interaction logs, usage metrics

Routed via `ZentinelleRouter`. Migrations:
```bash
python manage.py migrate                    # default + zentinelle
python manage.py migrate --database analytics
```

## LLM Providers (24+)

### Direct API
Anthropic, OpenAI, Google, Mistral, Cohere, AI21, DeepSeek

### Cloud / Managed
AWS Bedrock, Azure OpenAI, Vertex AI

### Inference platforms
Fireworks, Together, Groq, Cerebras, SambaNova, NVIDIA, Perplexity, xAI

### Routing
OpenRouter, LiteLLM

### Local / Self-hosted
Ollama, LM Studio, AnythingLLM, HuggingFace

## Auth modes

| Mode | Description | Use case |
|------|-------------|----------|
| `open` | No login, everyone is admin | Internal/dev behind VPN |
| `local` | Built-in username/password with session cookies | Self-hosted with managed users |
| `sso` | OIDC/SAML via external IdP | Enterprise (Google, Okta, Cognito, Entra) |

Production rejects `AUTH_MODE=open`.
