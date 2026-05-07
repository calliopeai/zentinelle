# Zentinelle

**Governance, Risk, and Compliance for AI agents.**

Zentinelle sits between your AI agents and their LLM providers, enforcing policies, scanning content, logging activity, and giving you a real-time compliance portal — without modifying agent code.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)]()

---

## How It Works

```
Your Agent  ──►  Zentinelle  ──►  LLM Provider
               (policy check)    (Anthropic, OpenAI, Google, Vertex AI)
               (content scan)
               (audit log)
               (usage tracking)
```

Two integration modes:

| Mode | How | Best for |
|------|-----|----------|
| **Hooks** | PreToolUse/PostToolUse intercepts every tool call | Claude Code, Gemini CLI |
| **Proxy** | Transparent HTTP proxy with policy enforcement | Any agent (Codex, LangChain, CrewAI, custom) |

## Features

- **24 policy evaluators** — rate limits, tool permissions, model restrictions, network policies, agent capabilities, safety settings, multimodal controls, output filtering, content scanning, and more
- **LLM proxy** — transparent passthrough to Anthropic, OpenAI, Google, and Vertex AI with policy enforcement and usage tracking
- **GRC portal** — Next.js 16 dashboard with agent monitoring, policy management, risk register, incident tracking, compliance frameworks
- **Multi-language SDK** — Python, TypeScript, Go, Java, C# — all aligned to the same service contract
- **Framework plugins** — LangChain, CrewAI, Vercel AI SDK — drop-in governance
- **Compliance frameworks** — SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF
- **Content scanning** — secrets, PII, prompt injection, jailbreak detection, multimodal analysis
- **RBAC** — admin/operator/viewer roles with OIDC/SSO support
- **Multi-cloud deployment** — Terraform for AWS (ECS/EKS), GCP (Cloud Run/GKE), Azure (Container Apps/AKS)

## Quick Start

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env    # edit: set ZENTINELLE_BOOTSTRAP_SECRET and SECRET_KEY
docker compose up -d
```

Migrations run automatically. Create your first admin user and bootstrap token:

```bash
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "my-first-token"
```

| Service | URL |
|---------|-----|
| Portal | http://localhost:8080 |
| GraphQL | http://localhost:8080/gql/zentinelle/ |
| REST API | http://localhost:8080/api/zentinelle/v1/ |
| LLM Proxy | http://localhost:8080/proxy/{provider}/ |
| Admin | http://localhost:8080/admin/ |

## Connect Your Agents

### Claude Code (hooks)

```bash
pip install zentinelle-agent
zentinelle-agent install --endpoint http://localhost:8080 --key <api-key>
```

### Any Agent (proxy)

```bash
zentinelle-agent proxy --provider openai --endpoint http://localhost:8080 --key <api-key>
export OPENAI_BASE_URL=http://127.0.0.1:8742
```

### SDK (programmatic)

```python
from zentinelle import ZentinelleClient

client = ZentinelleClient(
    api_key="bt_<tenant>_<signature>",
    agent_type="langchain",
)
result = client.register(name="My Agent")

# Check policy before acting
if client.evaluate("tool_call", context={"tool": "web_search"}).allowed:
    # proceed
    pass
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
| Proxy | nginx + httpx |
| Auth | Session cookies (httpOnly), OIDC/SSO, RBAC |
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

## Documentation

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Calliope AI](https://calliope.ai) · [zentinelle.ai](https://zentinelle.ai) · [Docs](https://zentinelle.dev)
