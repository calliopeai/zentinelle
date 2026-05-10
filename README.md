# Zentinelle

**Governance, Risk, and Compliance for AI agents.**

Zentinelle sits between your AI agents and their LLM providers, enforcing policies, scanning content, logging activity, and giving you a real-time GRC portal — without modifying agent code.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.3.0-green.svg)]()

---

## How It Works

```
Your Agent  ──►  Zentinelle  ──►  LLM Provider
               (policy check)    (Anthropic, OpenAI, Google,
               (content scan)     Mistral, Cohere, AI21, DeepSeek,
               (audit log)        AWS Bedrock, Azure, Vertex,
               (usage tracking)   Fireworks, Together, Groq, Cerebras,
                                  SambaNova, NVIDIA, Perplexity, xAI,
                                  OpenRouter, LiteLLM, Ollama, LM Studio,
                                  HuggingFace, AnythingLLM)
```

Three integration modes:

| Mode | How | Best for |
|------|-----|----------|
| **Hooks** | PreToolUse/PostToolUse intercepts every tool call | Claude Code, Gemini CLI |
| **Django proxy** | Transparent HTTP proxy with policy enforcement | Any agent — simple deployment |
| **Go gateway** | High-performance sidecar with credential injection | Enterprise — scales independently |

## Features

### Governance
- **24 policy evaluators** — rate limits, tool permissions, model restrictions, network policies, agent capabilities, safety settings, multimodal controls, output filtering, content scanning
- **Policy inheritance** — Org → Team → Deployment → Endpoint → User, most-specific wins
- **Policy simulator** — dry-run policies against historical events before enforcing
- **Policy analyzer** — detect conflicts, coverage gaps, ranking
- **Policy versioning** — full revision history with diff viewer
- **Agent groups** — bundle agents into tiers (standard / restricted / unrestricted) for shared policy scope
- **Compliance packs** — one-click activation of curated policy bundles (SOC 2 starter, GDPR starter, etc.)

### Risk
- **Risk register** — FMEA-style with Severity × Likelihood × Impact (Fibonacci scale)
- **Risk Priority Number** — RPN range 1–512, color-coded by criticality
- **Visual 5×5 matrix** for quick risk assessment
- **Risk overview** — organizational risk index with 30-day trend
- **Incident management** — SLA tracking, root cause, timeline, comments

### Compliance
- **Frameworks** — SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF (toggle per tenant)
- **Detailed control mapping** — each framework's controls mapped to Zentinelle features
- **Gap analysis** — missing capabilities with remediation guidance
- **Compliance reports** — exportable PDF/CSV/JSON
- **Legal holds** — freeze data retention for litigation/audit; release returns data to normal retention but the hold record persists in audit trail

### Observability
- **Real-time event stream** — live polling with filters
- **Audit log chain** — tamper-evident with cryptographic verification
- **Usage analytics** — tokens, cost, latency by agent/model/provider
- **Anomaly detection** — 2σ-based statistical detection
- **Alerts management** — acknowledge/resolve/dismiss

### AI Assistant
- **Chat bubble** on every page + dedicated `/assistant` page
- **24+ LLM providers** with live model discovery
- **Tool use** — 22 tools wired into your real GRC data, agentic loop with confirmation flow for mutations. Anthropic, OpenAI, and Google Gemini all supported.
- **Tenant-scoped encrypted API keys** — Fernet (AES-128 + HMAC-SHA256) at rest
- **Per-provider toggle** — enable/disable in chat without removing keys
- **Per-model enable/disable** — curate the model picker via Settings → LLM Providers → Models
- **Markdown rendering** — formatted responses with code blocks, lists, links

### System Prompts
- **Library** — versioned system prompts with categories, ratings, favorites
- **Builder** — guided UI for crafting prompts with token estimates
- **Generator** — AI-assisted prompt drafting from a brief
- **Fork** — clone any prompt as a starting point for a new one
- **Analyze** — get AI feedback (clarity, safety risks, ambiguity, token efficiency, per-section improvements)

### Multi-tenancy & Auth
- **AUTH_MODE=open** — no login (default for internal/dev behind VPN)
- **AUTH_MODE=local** — username/password with session cookies
- **AUTH_MODE=sso** — OIDC/SAML (Google, Okta, Cognito, Entra ID, Keycloak)
- **RBAC** — admin/operator/viewer roles
- **API keys** — platform-level keys with scoped permissions

### Multi-language SDK
- **Python, TypeScript, Go, Java, C#** — all aligned to the same service contract
- **Framework plugins** — LangChain, CrewAI, Vercel AI SDK
- **Methods**: register, evaluate, emit_event, heartbeat, log_interaction, deregister

### Infrastructure
- **Multi-cloud Terraform** — AWS (ECS/EKS), GCP (Cloud Run/GKE), Azure (Container Apps/AKS)
- **Docker Compose** for local + small deployments
- **Production hardening** — HSTS, secure cookies, secret validation, COOP

## Quick Start

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env

# For dev/internal: defaults to AUTH_MODE=open — just start
docker compose up -d
```

Visit **http://localhost:8080** — you're in the portal.

For agents to register, generate a bootstrap token:

```bash
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "my-first-token"
```

| Service | URL |
|---------|-----|
| Portal | http://localhost:8080 |
| GraphQL | http://localhost:8080/gql/zentinelle/ |
| REST API | http://localhost:8080/api/zentinelle/v1/ |
| LLM Proxy | http://localhost:8080/proxy/{provider}/ |
| Go Gateway | http://localhost:8742 |
| Admin | http://localhost:8080/admin/ |

## Production Deployment

```bash
# Generate required secrets
docker compose exec backend python manage.py generate_secrets

# Set in .env:
# - SECRET_KEY (Django)
# - ZENTINELLE_SECRET_KEY (Fernet, encrypts LLM keys)
# - ZENTINELLE_BOOTSTRAP_SECRET (HMAC, agent tokens)
# - ALLOWED_HOSTS (comma-separated)
# - AUTH_MODE=local or sso (open is rejected in prod)

DJANGO_SETTINGS_MODULE=config.settings.prod docker compose up -d
```

Production settings enforce:
- HSTS (1 year), secure cookies, X-Frame-Options DENY
- CORS allowlist (no wildcard)
- All required secrets present at startup (raises if missing)

See [docs/wiki/Deployment-Guide.md](docs/wiki/Deployment-Guide.md) for full details.

## Connect Your Agents

### Claude Code (hooks)

```bash
pip install zentinelle-agent
zentinelle-agent install --endpoint http://localhost:8080 --key <api-key>
```

### Any Agent (Django proxy)

```bash
zentinelle-agent proxy --provider openai --endpoint http://localhost:8080 --key <api-key>
export OPENAI_BASE_URL=http://127.0.0.1:8742
```

### Any Agent (Go gateway — high throughput)

The Go gateway handles policy enforcement and credential injection at the edge.
Agents authenticate with Zentinelle keys; the gateway swaps in the real provider key.

```bash
# Configure provider keys (encrypted in Zentinelle, env-var fallback)
docker compose exec backend python manage.py shell -c "
from zentinelle.models import LLMProviderKey
k = LLMProviderKey.objects.create(tenant_id='...', provider='openai')
k.set_key('sk-...')
k.save()"

# Or via the portal: Settings → LLM Providers

# Point your agent at the gateway
export OPENAI_BASE_URL=http://localhost:8742/v1
```

### SDK (programmatic)

```python
from zentinelle import ZentinelleClient

client = ZentinelleClient(
    api_key="bt_<tenant>_<signature>",
    agent_type="custom",
)
client.register(name="My Agent")

# Policy check before acting
if client.evaluate("tool_call", context={"tool": "web_search"}).allowed:
    # proceed with the action
    ...

# Log interaction directly (when bypassing the proxy)
client.log_interaction(
    prompt="What's the weather?",
    response="...",
    model="gpt-4o",
    input_tokens=20,
    output_tokens=50,
)

# Clean shutdown
client.deregister()
```

### LangChain

```python
from zentinelle_langchain import ZentinelleCallbackHandler

handler = ZentinelleCallbackHandler(api_key="sk_agent_...", agent_type="langchain")
llm = ChatOpenAI(callbacks=[handler])
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5, Strawberry GraphQL, Django REST Framework |
| Frontend | Next.js 16, React 19, Apollo Client 4, shadcn/ui, Tailwind CSS 4 |
| Database | PostgreSQL 16 (zentinelle + zentinelle_analytics schemas) |
| Cache | Redis 7 |
| Task queue | Celery + Celery Beat |
| Analytics | PostgreSQL (default), ClickHouse (optional for scale) |
| Proxy | nginx + httpx + Go gateway (sidecar) |
| Auth | Session cookies (httpOnly), OIDC/SSO, RBAC, AUTH_MODE switch |
| Encryption | Fernet (AES-128 + HMAC-SHA256) for LLM provider keys at rest |
| SDK | Python, TypeScript, Go, Java, C# |
| Infrastructure | Terraform (AWS/GCP/Azure), Docker Compose |

## Policy Types

| Policy | What it enforces |
|--------|-----------------|
| `rate_limit` | Requests per minute/hour, tokens per day |
| `tool_permission` | Allow/deny/require-approval per tool |
| `model_restriction` | Allowed models and providers |
| `network_policy` | Domain and IP allowlists/blocklists |
| `output_filter` | Content scanning on LLM responses |
| `safety_settings` | Gemini minimum safety thresholds |
| `multimodal_policy` | Image/audio/video controls and size limits |
| `budget_limit` | Token and cost budgets |
| `agent_capability` | Action-level RBAC with wildcard patterns |
| `secret_access` | Control which secrets agents can access |
| `context_limit` | Input/output/total token limits |
| `prompt_injection` | Prompt injection and jailbreak detection |

Plus: `human_oversight`, `system_prompt`, `ai_guardrail`, `session_policy`, `data_access`, `data_retention`, `audit_policy`, `agent_delegation`, `behavioral_baseline`, `session_quota`, `resource_quota`

## Demo Data

Seed realistic agents/policies/events/risks to demo the portal:

```bash
docker compose exec backend python manage.py seed_demo
docker compose exec backend python manage.py seed_demo --reset  # clear first
```

Opt-in only. Never auto-runs.

## Documentation

- [Architecture](docs/wiki/Architecture.md) — DB routing, auth flows, policy engine
- [API Reference](docs/wiki/API-Reference.md) — REST endpoints
- [Policy Reference](docs/wiki/Policy-Reference.md) — all 24 policy types
- [SDK Guide](docs/wiki/SDK-Guide.md) — Python/TS/Go/Java/C#
- [Compliance Frameworks](docs/wiki/Compliance-Frameworks.md) — SOC2/GDPR/HIPAA/AI Act/NIST mapping
- [Deployment Guide](docs/wiki/Deployment-Guide.md) — Docker, Terraform, secrets
- [Development Guide](docs/wiki/Development-Guide.md) — local setup, testing

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 Calliope Labs Inc. All Rights Reserved. Calliope AI is a trademark of Calliope Labs Inc.

Portions of the framework underlying this repo are derived from **[boilerworks-django-nextjs](https://github.com/ConflictHQ/boilerworks-django-nextjs)** (Copyright (c) Conflict LLC, MIT-licensed). Tip of the hat 🎩

---

Built by [Calliope AI](https://calliope.ai) · [zentinelle.ai](https://zentinelle.ai) · [Docs](https://zentinelle.dev)
