# SDK Guide

The Zentinelle SDKs wrap the agent-facing REST API at `/api/zentinelle/v1`. All maintained clients now follow the same bootstrap-to-runtime auth flow and the same core endpoint set.

SDK source: [github.com/calliopeai/zentinelle-sdk](https://github.com/calliopeai/zentinelle-sdk)

## Supported SDKs

| Language | Source Directory | Notes |
|----------|------------------|-------|
| Python | `python/zentinelle` | Synchronous client with background flush and heartbeat threads |
| TypeScript / Node | `typescript/src` | Async client for Node and compatible runtimes |
| Go | `go/zentinelle` | `context.Context`-based API |
| Java | `java/src/main/java/ai/zentinelle` | Builder-style client |
| C# | `csharp/src/Zentinelle` | Async-first client |

## Shared Flow

1. Create a client with a bootstrap token (`bt_...`), `agent_type`, and the Zentinelle service endpoint.
2. Call `register()` once on startup.
3. The server returns `agent_id`, a runtime `api_key`, initial `config`, and `policies`.
4. The SDK swaps from `X-Zentinelle-Bootstrap` to `X-Zentinelle-Key` automatically after registration.
5. Call `evaluate()` before guarded actions, `emit()` after them, and use `getConfig()` / `getSecrets()` for cached runtime state.
6. Let background heartbeat and flush loops run, or call the explicit flush/shutdown methods before exit.

## Shared Runtime Contract

All maintained SDKs target these endpoints:

| Method | Path | Used For |
|--------|------|----------|
| `POST` | `/register` | Bootstrap registration |
| `POST` | `/deregister` | Clean unregister on shutdown |
| `GET` | `/config/{agent_id}` | Runtime config and effective policies |
| `GET` | `/secrets/{agent_id}` | Scoped secrets |
| `POST` | `/evaluate` | Guardrail and policy checks |
| `POST` | `/events` | Buffered telemetry, audit, and alert events |
| `POST` | `/heartbeat` | Health and liveness reporting |
| `POST` | `/interaction` | Direct interaction logging (when bypassing proxy) |

Notes:

- Registration uses `X-Zentinelle-Bootstrap`; runtime requests use `X-Zentinelle-Key`.
- In this standalone repo, `/secrets` and `/secrets/{agent_id}` currently return an empty bundle unless secret provisioning is implemented externally.
- Heartbeat currently returns `202 Accepted` with `{"acknowledged": true}`. SDKs are tolerant of future drift/sync fields.
- `/deregister` and `/interaction` were added in v1.2.0 (Python, TypeScript, Go).

## Python

```python
from zentinelle import ZentinelleClient

client = ZentinelleClient(
    api_key="bt_<tenant_id>_<signature>",
    agent_type="codex",
    endpoint="http://localhost:8080",
)

registration = client.register(
    capabilities=["chat", "tool:search"],
    metadata={"version": "1.0.0"},
    name="codex-dev-agent",
)

decision = client.evaluate(
    "tool_call",
    user_id="user_123",
    context={"tool": "web_search"},
)

if not decision.allowed:
    raise PermissionError(decision.reason or "blocked by policy")

client.emit(
    "tool_call",
    {"tool": "web_search", "duration_ms": 1420},
    category="audit",
    user_id="user_123",
)

# Log a direct LLM interaction (when bypassing the proxy)
client.log_interaction(
    prompt="What's the weather in Paris?",
    response="It's currently 18°C and partly cloudy.",
    model="gpt-4o",
    provider="openai",
    input_tokens=20,
    output_tokens=15,
    cost_usd=0.0024,
)

client.flush_events()
client.deregister()  # cleanly unregister on shutdown
client.shutdown()
```

## TypeScript / Node

```typescript
import { ZentinelleClient } from 'zentinelle';

const client = new ZentinelleClient({
  apiKey: 'bt_<tenant_id>_<signature>',
  agentType: 'codex',
  endpoint: 'http://localhost:8080',
});

const registration = await client.register({
  capabilities: ['chat', 'tool:search'],
  metadata: { version: '1.0.0' },
  name: 'codex-dev-agent',
});

const decision = await client.evaluate('tool_call', {
  userId: 'user_123',
  context: { tool: 'web_search' },
});

if (!decision.allowed) {
  throw new Error(decision.reason ?? 'blocked by policy');
}

client.emit(
  'tool_call',
  { tool: 'web_search', duration_ms: 1420 },
  { category: 'audit', userId: 'user_123' }
);

await client.flushEvents();
await client.shutdown();
```

## Go

```go
client, err := zentinelle.NewClient(zentinelle.Config{
	APIKey:    "bt_<tenant_id>_<signature>",
	AgentType: "codex",
	Endpoint:  "http://localhost:8080",
})
if err != nil {
	log.Fatal(err)
}
defer client.Shutdown()

registration, err := client.Register(ctx, zentinelle.RegisterOptions{
	Capabilities: []string{"chat", "tool:search"},
	Metadata:     map[string]interface{}{"version": "1.0.0"},
	Name:         "codex-dev-agent",
})
if err != nil {
	log.Fatal(err)
}

decision, err := client.Evaluate(ctx, "tool_call", zentinelle.EvaluateOptions{
	UserID:  "user_123",
	Context: map[string]interface{}{"tool": "web_search"},
})
if err != nil {
	log.Fatal(err)
}
if !decision.Allowed {
	log.Fatalf("blocked: %s", decision.Reason)
}

client.Emit("tool_call", map[string]interface{}{
	"tool":        "web_search",
	"duration_ms": 1420,
}, zentinelle.EmitOptions{
	Category: "audit",
	UserID:   "user_123",
})

if err := client.FlushEvents(ctx); err != nil {
	log.Fatal(err)
}

_ = registration
```

## Java

```java
ZentinelleClient client = ZentinelleClient.builder()
    .apiKey("bt_<tenant_id>_<signature>")
    .agentType("codex")
    .endpoint("http://localhost:8080")
    .build();

RegisterResult registration = client.register(RegisterOptions.builder()
    .capabilities(List.of("chat", "tool:search"))
    .metadata(Map.of("version", "1.0.0"))
    .name("codex-dev-agent")
    .build());

EvaluateResult decision = client.evaluate("tool_call", EvaluateOptions.builder()
    .userId("user_123")
    .context(Map.of("tool", "web_search"))
    .build());

if (!decision.isAllowed()) {
    throw new IllegalStateException(decision.getReason());
}

client.emit(
    "tool_call",
    Map.of("tool", "web_search", "duration_ms", 1420),
    EmitOptions.builder().category(EventCategory.AUDIT).userId("user_123").build()
);

client.flushEvents();
client.shutdown();
```

## C#

```csharp
var client = new ZentinelleClient(new ZentinelleOptions
{
    ApiKey = "bt_<tenant_id>_<signature>",
    AgentType = "codex",
    BaseUrl = "http://localhost:8080",
});

var registration = await client.RegisterAsync(new RegisterOptions
{
    Capabilities = new List<string> { "chat", "tool:search" },
    Metadata = new Dictionary<string, object> { ["version"] = "1.0.0" },
    Name = "codex-dev-agent",
});

var decision = await client.EvaluateAsync("tool_call", new EvaluateOptions
{
    UserId = "user_123",
    Context = new Dictionary<string, object> { ["tool"] = "web_search" },
});

if (!decision.Allowed)
{
    throw new InvalidOperationException(decision.Reason ?? "blocked by policy");
}

client.EmitToolCall("web_search", "user_123", 1420);
await client.FlushAsync();
await client.DisposeAsync();
```

## Plugins

The SDK repo also carries framework adapters and runtime integrations under `plugins/`, including:

- `plugins/agent`
- `plugins/langchain`
- `plugins/crewai`
- `plugins/llamaindex`
- `plugins/ms-agent-framework`
- `plugins/n8n`
- `plugins/vercel-ai`

Use the plugin-specific READMEs in the SDK repo when you want framework-native instrumentation rather than calling the core client directly.

## Built-In Resilience

Across languages, the SDKs provide the same operational baseline:

- Retry with backoff for transient HTTP failures
- Circuit-breaker support plus configurable fail-open behavior
- Buffered event emission with periodic flush
- Cached config and secrets reads
- Periodic heartbeats once registration succeeds

The exact option names vary by language, but the behavior is intentionally aligned around the same server contract.
