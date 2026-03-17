# Zentinelle

**Runtime governance for AI coding agents.**

Zentinelle sits between your AI agents and their LLM providers, enforcing policies, logging activity, and giving you a real-time compliance dashboard — without modifying agent code.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.0.1-orange.svg)]()
[![Status](https://img.shields.io/badge/status-alpha-yellow.svg)]()

> **v0.0.1 alpha** — Working integrations with Claude Code and Codex. Looking for contributors and early adopters. [Open issues](https://github.com/calliopeai/zentinelle/issues)

---

## How It Works

```
Your Agent  ──►  Zentinelle  ──►  LLM Provider
               (policy check)    (Anthropic, OpenAI, Google)
               (audit log)
               (monitoring)
```

Two integration modes:

| Mode | How | Best for |
|------|-----|----------|
| **Hooks** | PreToolUse/PostToolUse intercepts every tool call | Claude Code, Gemini CLI |
| **Proxy** | Transparent HTTP proxy injects policy enforcement | Any agent (Codex, custom) |

## What's Working

- **Policy engine** — rate limits, tool permissions, model restrictions, network policies, agent capabilities
- **Real-time monitoring** — every tool call and LLM invocation visible in the dashboard
- **Multi-agent support** — Claude Code, Codex, and Gemini tracked side-by-side
- **LLM proxy** — transparent passthrough to Anthropic, OpenAI, Google with policy enforcement
- **Compliance dashboards** — SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF frameworks

## Quick Start

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
docker compose up -d

# First run
docker compose exec backend python manage.py migrate --database=zentinelle
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

Portal: `http://localhost:8080`
API: `http://localhost:8080/api/zentinelle/v1/`
GraphQL: `http://localhost:8080/gql/zentinelle/`
Proxy: `http://localhost:8080/proxy/<provider>/`

## Connect Your Agents

### Claude Code (hooks)

```bash
pip install zentinelle-agent

zentinelle-agent install \
  --endpoint http://localhost:8080 \
  --key <your-agent-key> \
  --agent-id my-claude-agent
```

Restart Claude Code. Every tool call now goes through Zentinelle.

### Codex / OpenAI (proxy)

```bash
# Terminal 1: start the proxy
zentinelle-agent proxy --provider openai \
  --endpoint http://localhost:8080 --key <your-agent-key>

# Terminal 2: point Codex at it
export OPENAI_BASE_URL=http://127.0.0.1:8742
codex
```

### Gemini (hooks)

```bash
zentinelle-agent install-gemini \
  --endpoint http://localhost:8080 \
  --key <your-agent-key> \
  --agent-id my-gemini-agent
```

### Register an agent

```bash
# Get a bootstrap token (set ZENTINELLE_BOOTSTRAP_SECRET in .env first)
curl -X POST http://localhost:8080/api/zentinelle/v1/register \
  -H "Content-Type: application/json" \
  -H "X-Zentinelle-Bootstrap: <bootstrap-token>" \
  -d '{"agent_type": "claude_code", "name": "my-agent"}'

# Returns: {"agent_id": "...", "api_key": "sk_agent_..."}
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5, Django REST Framework, Graphene (GraphQL) |
| Frontend | Next.js 14, Chakra UI |
| Database | PostgreSQL (isolated `zentinelle` schema) |
| Cache | Redis |
| Task queue | Celery + Celery Beat |
| Analytics | ClickHouse (optional) |
| Proxy | nginx (reverse proxy), httpx (LLM forwarding) |
| SDK | Python (`zentinelle-agent` on PyPI) |

## Policy Types

| Policy | What it enforces |
|--------|-----------------|
| `rate_limit` | Requests per minute/hour, tokens per day |
| `tool_permission` | Allow/deny/require-approval per tool |
| `model_restriction` | Allowed models and providers |
| `agent_capability` | Action-level RBAC with wildcards |
| `network_policy` | Domain and IP allowlists/blocklists |
| `output_filter` | Content scanning on LLM responses |
| `budget_limit` | Token and cost budgets |
| `secret_access` | Control which secrets agents can access |

Plus: `context_limit`, `human_oversight`, `system_prompt`, `ai_guardrail`, `session_policy`, `data_access`, `data_retention`, `audit_policy`, `prompt_injection`, `agent_delegation`, `behavioral_baseline`, `session_quota`, `resource_quota`

## Documentation

- [Architecture](docs/wiki/architecture.md)
- [API Reference](docs/wiki/api.md)
- [Policy Reference](docs/wiki/policies.md)
- [SDK Guide](docs/wiki/sdk.md)
- [Compliance Frameworks](docs/wiki/compliance.md)
- [Deployment Guide](docs/wiki/deployment.md)
- [Development Guide](docs/wiki/development.md)
- [Methodology Primer](docs/primer.md)

## Contributing

We're looking for contributors! Areas where help is needed:

- **Data pipeline** — token counting, cost estimation, latency measurement ([#68](https://github.com/calliopeai/zentinelle/issues/68), [#70-#76](https://github.com/calliopeai/zentinelle/issues))
- **Dynamic model catalog** — fetch model lists from providers ([#66](https://github.com/calliopeai/zentinelle/issues/66))
- **Accessibility** — keyboard navigation, focus visibility, WCAG AA ([#59-#65](https://github.com/calliopeai/zentinelle/issues))
- **Agent integrations** — more hooks/proxy support for other coding agents
- **Documentation site** — GitHub Pages at zentinelle.dev

See [open issues](https://github.com/calliopeai/zentinelle/issues) for the full list.

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Calliope AI](https://calliope.ai) · [zentinelle.ai](https://zentinelle.ai)
