
# Knowledge Graph

Zentinelle maintains a SQLite-backed knowledge graph of its codebase — 1300+ nodes covering models, views, evaluators, URLs, pages, and their relationships.

[**Open Interactive Graph →**](graph.html){ .md-button .md-button--primary }

Rebuild locally:

```bash
python3 scripts/codemap.py build    # index codebase → codemap.sqlite
python3 scripts/codemap.py query X  # search nodes
python3 scripts/codemap.py show X   # show node + connections
python3 scripts/codemap.py stats    # overview
python3 scripts/codemap.py export   # export JSON for viz
```

---

## Node types

| Type | Count | What |
|------|-------|------|
| `model` | 95 | Django models (AgentEndpoint, Policy, Event, InteractionLog, ...) |
| `view` | 44 | REST API views and GraphQL views |
| `evaluator` | 47 | Policy evaluators (rate_limit, tool_permission, ...) |
| `class` | 555 | Python classes |
| `graphql_type` | 118 | GraphQL ObjectTypes and InputTypes |
| `enum` | 53 | TextChoices enums (AgentType, PolicyType, ...) |
| `url` | 33 | REST API URL patterns |
| `page` | 18 | Next.js frontend pages |
| `nginx_route` | 5 | Nginx location blocks |
| `file` | 205 | Python source files |
| `function` | 185 | Top-level functions |

## Edge types

| Type | Count | Meaning |
|------|-------|---------|
| `contains` | 1094 | File contains class/function |
| `inherits` | 640 | Class extends another |
| `imports` | 542 | File imports from another |
| `routes_to` | 33 | URL pattern routes to a view |
| `evaluates` | 22 | PolicyEngine dispatches to evaluator |

---

## Data flows

### Hook flow (Claude Code / Gemini CLI)

```
Agent tool call
  │
  ▼
PreToolUse hook (pre_tool.py)
  │  reads: stdin (tool_name, tool_input)
  │  calls: POST /api/zentinelle/v1/evaluate
  │  sends: {agent_id, action: "tool_call", context: {tool, tool_input}}
  │
  ▼
EvaluateView (api/views/evaluate.py)
  │  auth: X-Zentinelle-Key → ZentinelleAPIKeyAuthentication
  │  calls: PolicyEngine.evaluate()
  │  creates: Event (audit) + InteractionLog (monitoring)
  │  returns: {allowed, reason, policies_evaluated}
  │
  ▼
PolicyEngine (services/policy_engine.py)
  │  loads: get_effective_policies() with scope inheritance
  │  cache: versioned keys in Redis (invalidated on policy CRUD)
  │  runs: each evaluator in services/evaluators/
  │  returns: EvaluationResult
  │
  ▼
PreToolUse hook
  │  exit 0 = allow, exit 2 = block (writes JSON to stdout)
  │
  ▼
Agent executes tool (or shows block reason)
  │
  ▼
PostToolUse hook (post_tool.py)
  │  reads: stdin (tool_name, tool_input, tool_response)
  │  calls: POST /api/zentinelle/v1/events
  │  fire-and-forget (background thread, always exit 0)
```

### Proxy flow (Codex / any agent)

```
Agent LLM call
  │  e.g. POST http://127.0.0.1:8742/responses
  │
  ▼
Local SDK proxy (zentinelle_agent/proxy.py)
  │  injects: X-Zentinelle-Key header
  │  forwards to: http://zentinelle:8080/proxy/openai/responses
  │
  ▼
nginx (/proxy/ location)
  │  proxy_pass to backend:8000
  │
  ▼
ProxyView (proxy/views.py)
  │  auth: X-Zentinelle-Key → StandaloneTenantResolver
  │  extracts: model, input_tokens from request body
  │  calls: PolicyEngine.evaluate(action="llm:invoke")
  │  creates: InteractionLog
  │  if blocked: returns 403 {error: "policy_denied"}
  │
  ▼
httpx forward to upstream provider
  │  strips: X-Zentinelle-Key, reverse-proxy headers
  │  sets: Host header to provider hostname
  │  streams: SSE responses back to agent
  │
  ▼
Agent receives LLM response
```

### Policy evaluation

```
PolicyEngine.evaluate(endpoint, action, user_id, context)
  │
  ├── get_effective_policies(endpoint, user_id)
  │     scope inheritance: Org → SubOrg → Deployment → Endpoint → User
  │     cache: versioned key "policies:v{N}:{tenant}:{endpoint}:{user}"
  │     merge: higher priority wins, later scope overrides
  │
  ├── for each policy:
  │     evaluator = _get_evaluator(policy.policy_type)
  │     result = evaluator.evaluate(policy, action, user_id, context)
  │     if enforcement == "enforce" and result.failed → BLOCK
  │     if enforcement == "audit" and result.failed → LOG (don't block)
  │
  └── return EvaluationResult(allowed, reason, policies_evaluated, warnings)
```

### Event processing

```
Event created (by evaluate, events endpoint, or heartbeat)
  │
  ▼
process_event_batch.apply_async([event_ids], category)
  │  routed to Celery queue by category (telemetry/audit/alert)
  │
  ▼
Celery worker processes event
  │  updates: Event.status → PROCESSED
  │  optionally: writes to ClickHouse for analytics
```

---

## Entry points

| URL | View | Service | Model |
|-----|------|---------|-------|
| `POST /api/zentinelle/v1/register` | RegisterView | -- | AgentEndpoint |
| `POST /api/zentinelle/v1/evaluate` | EvaluateView | PolicyEngine | Event, InteractionLog |
| `POST /api/zentinelle/v1/events` | EventsView | -- | Event |
| `POST /api/zentinelle/v1/heartbeat` | HeartbeatView | -- | AgentEndpoint, Event |
| `POST /api/zentinelle/v1/interaction` | LogInteractionView | -- | InteractionLog |
| `POST /proxy/<provider>/<path>` | ProxyView | PolicyEngine | InteractionLog |
| `POST /gql/zentinelle/` | GraphQLView | -- | all models |

## Key files

| File | What it does |
|------|-------------|
| `backend/zentinelle/services/policy_engine.py` | Core policy evaluation with scope inheritance and caching |
| `backend/zentinelle/services/evaluators/*.py` | 22 individual policy evaluators |
| `backend/zentinelle/proxy/views.py` | LLM proxy with policy enforcement |
| `backend/zentinelle/api/views/evaluate.py` | Policy evaluation REST endpoint |
| `backend/zentinelle/api/auth.py` | API key authentication |
| `backend/zentinelle/auth/resolver.py` | TenantResolver interface |
| `backend/zentinelle/models/endpoint.py` | AgentEndpoint model (agent types, keys, health) |
| `backend/zentinelle/models/policy.py` | Policy model (types, scopes, config) |
| `backend/zentinelle/models/event.py` | Event model (telemetry, audit, alert) |
| `backend/zentinelle/models/compliance.py` | InteractionLog, ContentScan, ComplianceAlert |
| `backend/config/urls.py` | URL routing (api/, gql/, proxy/, admin/) |
| `docker/nginx.conf` | Reverse proxy routing |
| `zentinelle-sdk.git/plugins/agent/` | SDK: hooks, proxy, CLI |
| `scripts/codemap.py` | Knowledge graph builder + query CLI |

## Model relationships

```
AgentEndpoint
  ├── has many: Event
  ├── has many: InteractionLog
  ├── has many: Policy (via scope_endpoint)
  └── belongs to: AgentGroup (optional)

Policy
  ├── scope_type: organization | sub_organization | deployment | endpoint | user
  ├── policy_type: rate_limit | tool_permission | model_restriction | ... (22 types)
  └── enforcement: enforce | audit | disabled

Event
  ├── belongs to: AgentEndpoint
  ├── category: telemetry | audit | alert
  └── status: pending | processing | processed | failed

InteractionLog
  ├── belongs to: AgentEndpoint
  ├── interaction_type: chat | function_call | code_gen | ...
  └── has one: ContentScan (optional, for compliance scanning)
```
