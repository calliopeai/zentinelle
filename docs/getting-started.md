
# Getting Started

## 1. Start Zentinelle

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env

# Default AUTH_MODE=local — create an administrator after startup.
docker compose up -d
```

Open **<http://localhost:8080>** — you're in the portal as admin.

| URL | What |
|-----|------|
| `http://localhost:8080` | GRC Portal |
| `http://localhost:8080/api/zentinelle/v1/` | Agent REST API |
| `http://localhost:8080/gql/zentinelle/` | GraphQL API |
| `http://localhost:8080/proxy/<provider>/` | Django LLM Proxy |
| `http://localhost:8742` | Go LLM Gateway |
| `http://localhost:8080/admin/` | Django Admin |

For local dev, no further setup is needed. Migrations run automatically.

## 2. Configure an LLM provider

Open **Settings → LLM Providers** and paste an API key for any provider:
Anthropic, OpenAI, Google, Mistral, DeepSeek, Groq, Cerebras, etc.

Keys are encrypted at rest with Fernet. Once set, the AI assistant
(chat bubble in the bottom right) will pull live model lists from each
configured provider.

## 3. Register an agent

Generate a bootstrap token:

```bash
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "my-first-agent"
```

Then register from your agent code:

=== "Python"

    ```python
    from zentinelle import ZentinelleClient

    client = ZentinelleClient(
        api_key="bt_00000000-...-...",
        agent_type="custom",
        endpoint="http://localhost:8080",
    )
    client.register(name="My Agent")
    ```

=== "TypeScript"

    ```typescript
    import { ZentinelleClient } from "@zentinelle/sdk";

    const client = new ZentinelleClient({
      apiKey: "bt_00000000-...-...",
      agentType: "custom",
      endpoint: "http://localhost:8080",
    });
    await client.register({ name: "My Agent" });
    ```

=== "Go"

    ```go
    client := zentinelle.NewClient(
        "bt_00000000-...-...",
        zentinelle.WithEndpoint("http://localhost:8080"),
        zentinelle.WithAgentType("custom"),
    )
    client.Register(ctx, zentinelle.RegisterOptions{Name: "My Agent"})
    ```

=== "REST"

    ```bash
    curl -X POST http://localhost:8080/api/zentinelle/v1/register \
      -H "Content-Type: application/json" \
      -H "X-Zentinelle-Bootstrap: bt_00000000-...-..." \
      -d '{"agent_type": "custom", "name": "my-agent"}'
    ```

Save the returned `api_key` (`sk_agent_...`) — your agent uses it for
subsequent calls (events, evaluate, heartbeat).

## 4. Connect your agent

### Claude Code (hooks)

```bash
pip install zentinelle-agent
zentinelle-agent install \
  --endpoint http://localhost:8080 \
  --key sk_agent_<your-key> \
  --agent-id my-agent
```

Restart Claude Code — every tool call now flows through Zentinelle.

### Any agent (Django proxy)

```bash
# Terminal 1: start the local proxy bridge
zentinelle-agent proxy --provider openai \
  --endpoint http://localhost:8080 --key sk_agent_<your-key>

# Terminal 2: point your agent at it
export OPENAI_BASE_URL=http://127.0.0.1:8742
codex
```

### Any agent (Go gateway — production)

The Go gateway holds provider API keys; agents authenticate with
Zentinelle keys only. Best for enforcement at scale.

```bash
# Configure your provider key in Settings → LLM Providers. The gateway reads it
# with a token the backend mints into a shared compose volume; to pin one in
# .env instead, run `make gateway-token` once.
# Then point your agent at the gateway. It sends its Zentinelle key in the
# X-Zentinelle-Key header (see gateway/README.md); a provider key it sends is
# dropped, and the tenant's stored key is used instead.
export OPENAI_BASE_URL=http://localhost:8742/v1
```

## 5. Create a policy

In **Governance → Policies**, click **Create Policy**. Or via GraphQL:

```graphql
mutation {
  createPolicy(
    input: {
      name: "Production Rate Limit"
      policyType: "rate_limit"
      scopeType: "organization"
      enforcement: "enforce"
      config: "{\"requests_per_minute\": 60}"
    }
  ) { policy { id } }
}
```

## 6. Watch the dashboard

- **Dashboard** — agents, policies, API calls, recent activity
- **Agents** — health grid, type distribution, per-agent details
- **Events** — live event stream with filters
- **Audit Logs** — tamper-evident chain of every action
- **Monitoring** — usage analytics (tokens, cost, latency)
- **Risk Overview** — organizational risk index, FMEA, top risks
- **Compliance Frameworks** — SOC2/GDPR/HIPAA/EU AI Act/NIST coverage
- **AI Assistant** — chat bubble for explaining anything

## 7. Demo data

To populate realistic agents/policies/events for showcasing:

```bash
docker compose exec backend python manage.py seed_demo
```

Opt-in only — never auto-runs.

## 8. Production deployment

When you're ready for production, see [Deployment Guide](wiki/Deployment-Guide.md).
The short version:

```bash
# Generate secrets
python3 -c 'import secrets,base64; print("SECRET_KEY="+secrets.token_hex(32)); print("ZENTINELLE_BOOTSTRAP_SECRET="+secrets.token_hex(32)); print("ZENTINELLE_SECRET_KEY="+base64.urlsafe_b64encode(secrets.token_bytes(32)).decode()); print("POSTGRES_PASSWORD="+secrets.token_hex(24))'

# Set in .env
SECRET_KEY=<generated>
ZENTINELLE_SECRET_KEY=<generated>
ZENTINELLE_BOOTSTRAP_SECRET=<generated>
ZENTINELLE_DOMAIN=zentinelle.example.com
POSTGRES_PASSWORD=<generated>
AUTH_MODE=local  # or sso

# Use prod settings
docker compose -f compose.production.yaml up -d --build
```

Production settings reject startup if required secrets are missing or weak. See [control upgrade notes](dependable-controls.md) before upgrading an existing database.
