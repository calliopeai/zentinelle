# API Reference

Zentinelle exposes two API surfaces:

- **REST API** (`/api/zentinelle/`) — agent-facing. Used by the SDK. Optimized for low latency.
- **GraphQL** (`/gql/zentinelle/`) — management portal. Used by the GRC frontend. Full CRUD.

---

## REST API (Agent-Facing)

All endpoints require `Authorization: Bearer <api_key>` (obtained at registration).

Base URL: `https://your-zentinelle.example.com/api/zentinelle/`

---

### POST /register

Register a new agent. Returns an API key for all subsequent calls.

**Auth:** `Authorization: Bearer <tenant_api_key>` (org-level key, not agent key)

**Request:**
```json
{
  "name": "my-research-agent",
  "capabilities": ["llm:invoke", "tool:search", "tool:code_exec"],
  "deployment_id": "dep_abc123",
  "metadata": {
    "version": "1.2.0",
    "framework": "langchain"
  }
}
```

**Response `201`:**
```json
{
  "agent_id": "my-research-agent-x7k2",
  "api_key": "zk_live_...",
  "api_key_prefix": "zk_live_x7k",
  "config": { ... },
  "policies": [ ... ]
}
```

**Notes:**
- `agent_id` is a slug. Unique within tenant.
- `api_key` is returned once — store it. Only `api_key_hash` and `api_key_prefix` are stored server-side.
- `capabilities` determines which policy types apply to this agent.

---

### POST /evaluate

Check a request against active policies. Call this before executing any LLM call or tool use.

**Request:**
```json
{
  "request_type": "llm.invoke",
  "model": "gpt-4o",
  "tokens_requested": 2000,
  "messages": [...],
  "context": {
    "user_id": "user_xyz",
    "session_id": "sess_abc"
  }
}
```

**Response `200`:**
```json
{
  "allowed": true,
  "policies_evaluated": 12,
  "restrictions": {
    "max_tokens": 4000,
    "allowed_models": ["gpt-4o", "claude-3-5-sonnet"]
  },
  "warnings": [],
  "evaluation_id": "eval_..."
}
```

**Response `200` (blocked):**
```json
{
  "allowed": false,
  "reason": "rate_limit_exceeded",
  "policy_id": "pol_...",
  "retry_after": 60
}
```

**Notes:**
- Always returns `200`. Check `allowed` field. Non-2xx means service error.
- On timeout, SDK fails open (continues) unless `fail_open: false` is set.
- `evaluation_id` links to the `InteractionLog` record.

---

### GET /config

Fetch current configuration and policy set for this agent. SDK caches this response.

**Response `200`:**
```json
{
  "agent_id": "my-research-agent-x7k2",
  "policies": [
    {
      "id": "pol_...",
      "type": "rate_limit",
      "config": { "requests_per_minute": 60 },
      "scope": "org"
    }
  ],
  "allowed_models": ["gpt-4o", "claude-3-5-sonnet"],
  "features": {
    "content_scanning": true,
    "audit_logging": true
  },
  "cache_ttl": 300
}
```

**Notes:**
- SDK caches this for `cache_ttl` seconds. Stale config is used if Zentinelle is unreachable.
- Config changes propagate within one cache TTL cycle.

---

### POST /events

Ingest telemetry events. Accepts bulk batches for efficiency.

**Request:**
```json
{
  "events": [
    {
      "type": "llm.response",
      "timestamp": "2026-03-14T18:00:00Z",
      "evaluation_id": "eval_...",
      "data": {
        "model": "gpt-4o",
        "tokens_input": 1200,
        "tokens_output": 647,
        "cost_usd": 0.0187,
        "latency_ms": 1420,
        "finish_reason": "stop"
      }
    },
    {
      "type": "tool.invoked",
      "timestamp": "2026-03-14T18:00:01Z",
      "data": {
        "tool": "search",
        "query": "...",
        "result_count": 10
      }
    }
  ]
}
```

**Response `202`:**
```json
{ "accepted": 2, "dropped": 0 }
```

**Event types:**

| Type | Description |
|------|-------------|
| `llm.invoke` | LLM call initiated |
| `llm.response` | LLM response received (with token counts, cost) |
| `tool.invoked` | Tool/function called |
| `tool.result` | Tool result returned |
| `agent.started` | Agent session started |
| `agent.stopped` | Agent session ended |
| `policy.blocked` | Request blocked by policy |
| `error.occurred` | Agent error |

**Notes:**
- SDK buffers events locally and flushes in batches (default: 100 events or 5s).
- `202 Accepted` means queued for processing, not yet committed to DB.

---

### POST /heartbeat

Report agent health status. Call periodically (default: every 30s).

**Request:**
```json
{
  "status": "healthy",
  "metrics": {
    "requests_processed": 142,
    "errors_last_5min": 0,
    "avg_latency_ms": 1340
  }
}
```

**Response `200`:**
```json
{
  "acknowledged": true,
  "config_version": "v14",
  "config_updated": false
}
```

**Notes:**
- If `config_updated: true`, SDK should re-fetch `/config`.
- Agent status goes `unhealthy` after 3 missed heartbeats (90s default).

---

### GET /secrets

Retrieve scoped secrets for this agent. Secrets are stored encrypted, scoped to tenant/deployment/agent.

**Response `200`:**
```json
{
  "secrets": {
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

**Notes:**
- Only secrets explicitly granted to this agent's scope are returned.
- Secrets are decrypted server-side and transmitted over TLS. Never stored in agent code or environment.

---

## GraphQL API (Management Portal)

**Endpoint:** `POST /gql/zentinelle/`
**Auth:** `Authorization: Bearer <user_jwt>`

The management GraphQL API provides full CRUD for all Zentinelle resources. Used exclusively by the GRC portal frontend.

### Key Query Types

```graphql
type AgentEndpointType {
  id: UUID!
  agentId: String!           # slug identifier
  apiKeyPrefix: String!
  tenantId: String!
  status: AgentStatus!
  health: HealthStatus!
  capabilities: [String!]!
  lastHeartbeat: DateTime
  createdAt: DateTime!
}

type PolicyType {
  id: UUID!
  name: String!
  policyType: PolicyTypeEnum!
  scopeType: ScopeType!      # ORG | TEAM | DEPLOYMENT | ENDPOINT | USER
  scopeId: String!
  config: JSONString!
  isActive: Boolean!
  version: Int!
  tenantId: String!
}

type EventType {
  id: UUID!
  agentEndpoint: AgentEndpointType!
  eventType: String!
  payload: JSONString!
  timestamp: DateTime!
}
```

### Schema Ordering Rule

All ObjectType/InputType classes MUST be defined before any Query or Mutation that references them. See [CLAUDE.md](../../CLAUDE.md).

---

## Error Reference

| HTTP | Code | Description |
|------|------|-------------|
| 401 | `unauthorized` | Missing or invalid API key |
| 403 | `forbidden` | Valid key but insufficient scope |
| 429 | `rate_limited` | Platform-level rate limit (not policy) |
| 503 | `service_unavailable` | Zentinelle degraded — SDK fails open |
| 200 | `policy_blocked` | Request rejected by policy (check `allowed` field) |
