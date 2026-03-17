---
layout: default
title: Getting Started
nav_order: 2
---

# Getting Started

## 1. Start Zentinelle

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
docker compose up -d

docker compose exec backend python manage.py migrate --database=zentinelle
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

| URL | What |
|-----|------|
| `http://localhost:8080` | GRC Portal |
| `http://localhost:8080/api/zentinelle/v1/` | Agent REST API |
| `http://localhost:8080/gql/zentinelle/` | GraphQL API |
| `http://localhost:8080/proxy/<provider>/` | LLM Proxy |

## 2. Register an agent

Set `ZENTINELLE_BOOTSTRAP_SECRET` in your `.env`, then:

```bash
curl -X POST http://localhost:8080/api/zentinelle/v1/register \
  -H "Content-Type: application/json" \
  -H "X-Zentinelle-Bootstrap: <your-bootstrap-token>" \
  -d '{"agent_type": "claude_code", "name": "my-agent"}'
```

Save the returned `api_key` -- you'll need it to connect your agent.

## 3. Connect your agent

### Claude Code (hooks)

```bash
pip install zentinelle-agent

zentinelle-agent install \
  --endpoint http://localhost:8080 \
  --key sk_agent_<your-key> \
  --agent-id my-agent
```

Restart Claude Code. Every tool call now flows through Zentinelle.

### Codex (proxy)

```bash
# Terminal 1
zentinelle-agent proxy --provider openai \
  --endpoint http://localhost:8080 --key sk_agent_<your-key>

# Terminal 2
export OPENAI_BASE_URL=http://127.0.0.1:8742
codex
```

### Gemini (hooks)

```bash
zentinelle-agent install-gemini \
  --endpoint http://localhost:8080 \
  --key sk_agent_<your-key> \
  --agent-id my-gemini-agent
```

## 4. Create a policy

In the portal at `http://localhost:8080`, go to **Governance > Policies** and create your first policy. Or via GraphQL:

```graphql
mutation {
  createPolicy(
    organizationId: "<your-tenant-id>"
    input: {
      name: "Rate Limit"
      policyType: "rate_limit"
      enforcement: "enforce"
      config: "{\"requests_per_minute\": 60}"
    }
  ) { success }
}
```

## 5. Watch the dashboard

Go to **Agents > Monitoring**. You'll see every tool call and LLM invocation from your connected agents in real time.
