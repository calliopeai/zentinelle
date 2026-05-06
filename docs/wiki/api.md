# API Reference

Zentinelle exposes two API surfaces:

- **REST API** (`/api/zentinelle/v1/`) — agent-facing. Used by SDKs and direct agent integrations.
- **GraphQL** (`/gql/zentinelle/`) — management portal. Used by the GRC frontend. Full CRUD.

---

## REST API (Agent-Facing)

Base URL: `https://your-zentinelle.example.com/api/zentinelle/v1`

### Authentication

- `POST /register` requires `X-Zentinelle-Bootstrap: bt_<tenant_id>_<signature>`
- All other agent endpoints require `X-Zentinelle-Key: sk_agent_...`
- In standalone mode, bootstrap tokens are HMAC-signed with `ZENTINELLE_BOOTSTRAP_SECRET`

### Core SDK Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/register` | Register an agent and mint its runtime API key |
| `GET` | `/config/{agent_id}` | Fetch current config and effective policies |
| `GET` | `/secrets` | Fetch secrets for the authenticated agent |
| `GET` | `/secrets/{agent_id}` | SDK-compatible secrets lookup scoped to one agent |
| `POST` | `/evaluate` | Evaluate a guarded action before execution |
| `POST` | `/events` | Submit buffered telemetry, audit, and alert events |
| `POST` | `/heartbeat` | Report health and liveness |
| `POST` | `/deregister` | Deactivate an agent endpoint |

Additional compliance and reporting endpoints also live under `/api/zentinelle/v1`, but the sections below focus on the runtime contract consumed by the SDKs.

---

### POST /register

Register a new agent and return the runtime key for all subsequent calls.

**Auth:** `X-Zentinelle-Bootstrap: bt_<tenant_id>_<signature>`

**Request:**
```json
{
  "agent_id": "codex-dev-agent",
  "name": "Codex Dev Agent",
  "agent_type": "codex",
  "capabilities": ["chat", "tool:search"],
  "metadata": {
    "version": "1.2.0",
    "framework": "codex"
  }
}
```

**Response `201`:**
```json
{
  "agent_id": "codex-dev-agent",
  "api_key": "sk_agent_...",
  "config": {
    "heartbeat_interval_seconds": 60,
    "event_batch_size": 100,
    "event_flush_interval_seconds": 5,
    "config_refresh_interval_seconds": 300
  },
  "policies": []
}
```

**Notes:**
- `agent_id` is optional. If omitted, the server generates a slug from `agent_type`.
- `name` is optional. If omitted, it defaults to the final `agent_id`.
- `agent_type` must be one of the backend enum values such as `codex`, `claude_code`, `gemini`, `langchain`, or `custom`.
- `api_key` is only returned during registration. SDKs must switch to `X-Zentinelle-Key` after this response.

---

### GET /config/{agent_id}

Fetch runtime config and effective policies for the authenticated agent.

**Auth:** `X-Zentinelle-Key: sk_agent_...`

**Response `200`:**
```json
{
  "agent_id": "codex-dev-agent",
  "config": {
    "heartbeat_interval_seconds": 60,
    "event_batch_size": 100,
    "event_flush_interval_seconds": 5,
    "config_refresh_interval_seconds": 300
  },
  "policies": [
    {
      "id": "8f08664c-8f3e-4df7-b117-4af39b4d1fe0",
      "name": "Tool Allowlist",
      "type": "tool_permission",
      "enforcement": "enforce",
      "config": {
        "allowed_tools": ["web_search"]
      }
    }
  ],
  "updated_at": "2026-04-09T18:00:00+00:00"
}
```

**Notes:**
- The `{agent_id}` path must match the authenticated agent or the server returns `403`.
- SDKs cache this response and refresh it periodically or after a heartbeat drift signal.

---

### GET /secrets

Return secrets scoped to the authenticated agent.

**Auth:** `X-Zentinelle-Key: sk_agent_...`

**Response `200`:**
```json
{
  "secrets": {},
  "providers": {},
  "expires_at": "2026-04-09T18:01:00+00:00"
}
```

### GET /secrets/{agent_id}

SDK-compatible variant of the secrets endpoint. The authenticated agent may only request its own `agent_id`.

**Notes:**
- In this standalone repo, managed secret bundles are stubbed, so the endpoint currently returns an empty payload when no secrets are provisioned.
- SDKs typically call `/secrets/{agent_id}`; `/secrets` is a convenience alias for the current agent.

---

### POST /evaluate

Check an action against active policies before executing it.

**Auth:** `X-Zentinelle-Key: sk_agent_...`

**Request:**
```json
{
  "agent_id": "codex-dev-agent",
  "action": "tool_call",
  "user_id": "user_xyz",
  "context": {
    "tool": "web_search"
  }
}
```

**Response `200` (allowed):**
```json
{
  "allowed": true,
  "reason": null,
  "policies_evaluated": [
    {
      "id": "8f08664c-8f3e-4df7-b117-4af39b4d1fe0",
      "name": "Tool Allowlist",
      "type": "tool_permission",
      "result": "pass",
      "message": null
    }
  ],
  "warnings": [],
  "context": {
    "tool": "web_search"
  }
}
```

**Response `200` (blocked):**
```json
{
  "allowed": false,
  "reason": "Tool web_search is not permitted",
  "policies_evaluated": [
    {
      "id": "8f08664c-8f3e-4df7-b117-4af39b4d1fe0",
      "name": "Tool Allowlist",
      "type": "tool_permission",
      "result": "fail",
      "message": "Tool web_search is not permitted"
    }
  ],
  "warnings": [],
  "context": {
    "tool": "web_search"
  }
}
```

**Notes:**
- Always returns `200`. Check `allowed` field. Non-2xx means service error.
- `policies_evaluated` entries use `result: "pass" | "fail"` plus an optional `message`.
- The request `agent_id` must match the authenticated agent or the server returns `403`.

---

### POST /events

Ingest telemetry, audit, or alert events in bulk.

**Auth:** `X-Zentinelle-Key: sk_agent_...`

**Request:**
```json
{
  "agent_id": "codex-dev-agent",
  "events": [
    {
      "type": "tool_call",
      "category": "audit",
      "timestamp": "2026-03-14T18:00:00Z",
      "user_id": "user_xyz",
      "payload": {
        "tool": "web_search",
        "duration_ms": 1420
      }
    }
  ]
}
```

**Response `202`:**
```json
{
  "accepted": 1,
  "batch_id": "batch_9e6d7d0f9b324d7c"
}
```

**Notes:**
- `category` must be one of `telemetry`, `audit`, or `alert`.
- `type` is free-form and stored as the event type.
- `202 Accepted` means queued for processing, not yet committed to DB.

---

### POST /heartbeat

Report agent health and liveness.

**Auth:** `X-Zentinelle-Key: sk_agent_...`

**Request:**
```json
{
  "agent_id": "codex-dev-agent",
  "status": "healthy",
  "metrics": {
    "requests_processed": 142,
    "errors_last_5min": 0,
    "avg_latency_ms": 1340
  },
  "config_hash": "sha256:abc123",
  "secrets_hash": "sha256:def456",
  "version": "1.2.0",
  "telemetry": {
    "uptime_seconds": 3600
  }
}
```

**Response `202`:**
```json
{
  "acknowledged": true
}
```

**Notes:**
- `status` must be one of `healthy`, `degraded`, `unhealthy`, or `unknown`.
- The current standalone implementation returns `{"acknowledged": true}` and HTTP `202`.
- SDKs should tolerate future optional fields such as drift or sync signals in the heartbeat response.

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

All ObjectType/InputType classes MUST be defined before any Query or Mutation that references them. See [CLAUDE.md](https://github.com/calliopeai/zentinelle/blob/main/CLAUDE.md).

---

## Error Reference

| HTTP | Code | Description |
|------|------|-------------|
| 401 | `unauthorized` | Missing or invalid API key |
| 403 | `forbidden` | Valid key but insufficient scope |
| 429 | `rate_limited` | Platform-level rate limit (not policy) |
| 503 | `service_unavailable` | Zentinelle degraded — SDK fails open |
| 200 | `policy_blocked` | Request rejected by policy (check `allowed` field) |
