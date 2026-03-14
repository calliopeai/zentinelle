# SDK Guide

The Zentinelle SDK is a lightweight client library that connects your agent to the Zentinelle service. It handles registration, policy evaluation, telemetry, and resilience patterns.

SDK source: [github.com/calliopeai/zentinelle-sdk](https://github.com/calliopeai/zentinelle-sdk)

## Supported Languages

| Language | Package | Status |
|----------|---------|--------|
| Python | `zentinelle` (PyPI) | Stable |
| TypeScript/Node | `zentinelle` (npm) | Stable |
| Go | `github.com/calliopeai/zentinelle-go` | Stable |
| Java | `ai.zentinelle:zentinelle-sdk` | Stable |
| C# | `Zentinelle.SDK` (NuGet) | Stable |

## Core Interface

All SDK implementations expose the same interface:

```
register(capabilities)    → agent_id, api_key, initial_config
evaluate(context)         → { allowed, restrictions, evaluation_id }
get_config()              → current policy set (cached)
get_secrets()             → scoped secrets dict
emit(event)               → queued for async send
heartbeat(metrics)        → ack, config_updated flag
```

---

## Python

```bash
pip install zentinelle
```

```python
from zentinelle import ZentinelleClient, ZentinelleConfig

config = ZentinelleConfig(
    api_key="zk_live_...",
    endpoint="https://zentinelle.your-org.com",
    fail_open=True,          # continue if Zentinelle unreachable
    cache_ttl=300,           # seconds to cache config/policy set
    batch_size=100,          # events to buffer before flush
    flush_interval=5.0,      # seconds between event flushes
)

client = ZentinelleClient(config)
await client.register(capabilities=["llm:invoke", "tool:search"])

# Before LLM call
decision = await client.evaluate({
    "request_type": "llm.invoke",
    "model": "gpt-4o",
    "tokens_requested": 2000,
    "context": {"user_id": "user_xyz"}
})

if not decision.allowed:
    raise PolicyViolation(f"Blocked: {decision.reason}")

# After LLM call
await client.emit({
    "type": "llm.response",
    "evaluation_id": decision.evaluation_id,
    "data": {
        "model": "gpt-4o",
        "tokens_input": 1200,
        "tokens_output": 647,
        "cost_usd": 0.0187,
        "latency_ms": 1420,
    }
})
```

### Context Manager (recommended)

```python
async with ZentinelleClient(config) as client:
    await client.register(capabilities=["llm:invoke"])
    # client flushes all pending events on __aexit__
```

### Sync API

```python
from zentinelle.sync import ZentinelleClient

client = ZentinelleClient(config)
decision = client.evaluate({"model": "gpt-4o", "tokens_requested": 1000})
```

---

## TypeScript / Node

```bash
npm install zentinelle
```

```typescript
import { ZentinelleClient } from 'zentinelle';

const client = new ZentinelleClient({
  apiKey: 'zk_live_...',
  endpoint: 'https://zentinelle.your-org.com',
  failOpen: true,
  cacheTtl: 300,
});

await client.register({ capabilities: ['llm:invoke', 'tool:search'] });

const decision = await client.evaluate({
  requestType: 'llm.invoke',
  model: 'claude-3-5-sonnet',
  tokensRequested: 2000,
  context: { userId: 'user_xyz' },
});

if (!decision.allowed) {
  throw new PolicyViolationError(decision.reason);
}

await client.emit({
  type: 'llm.response',
  evaluationId: decision.evaluationId,
  data: { model: 'claude-3-5-sonnet', tokensInput: 1100, tokensOutput: 450, costUsd: 0.012 },
});
```

---

## Go

```bash
go get github.com/calliopeai/zentinelle-go
```

```go
import "github.com/calliopeai/zentinelle-go"

client := zentinelle.NewClient(zentinelle.Config{
    APIKey:   "zk_live_...",
    Endpoint: "https://zentinelle.your-org.com",
    FailOpen: true,
})

if err := client.Register(ctx, []string{"llm:invoke"}); err != nil {
    log.Fatal(err)
}

decision, err := client.Evaluate(ctx, zentinelle.EvaluateRequest{
    RequestType:     "llm.invoke",
    Model:           "gpt-4o",
    TokensRequested: 2000,
})

if !decision.Allowed {
    return fmt.Errorf("blocked: %s", decision.Reason)
}
```

---

## Framework Plugins

Framework plugins wrap the core SDK methods so you don't need to instrument your agent code manually.

### LangChain (Python)

```python
from zentinelle.plugins.langchain import ZentinelleCallbackHandler

handler = ZentinelleCallbackHandler(client)

llm = ChatOpenAI(
    model="gpt-4o",
    callbacks=[handler],   # wraps all LLM calls automatically
)
```

The handler automatically calls `evaluate()` before each LLM invocation and `emit()` with token counts after.

### LangChain (TypeScript)

```typescript
import { ZentinelleCallbackHandler } from 'zentinelle/plugins/langchain';

const handler = new ZentinelleCallbackHandler(client);
const llm = new ChatOpenAI({ callbacks: [handler] });
```

### CrewAI

```python
from zentinelle.plugins.crewai import ZentinelleGuard

guard = ZentinelleGuard(client)

@guard.protect
class MyAgent(Agent):
    role = "researcher"
    goal = "..."
```

### Vercel AI SDK

```typescript
import { withZentinelle } from 'zentinelle/plugins/vercel-ai';

const model = withZentinelle(openai('gpt-4o'), client);
// Use model as normal — evaluate/emit happen automatically
```

### LlamaIndex, n8n, Microsoft Agent Framework

See plugin-specific READMEs in `zentinelle-sdk/plugins/`.

---

## Resilience Patterns

### Circuit Breaker

If Zentinelle returns errors above a threshold, the circuit opens and `evaluate()` fails-open (returns `allowed: true` without calling the service).

```python
config = ZentinelleConfig(
    circuit_breaker_threshold=0.5,    # 50% error rate opens circuit
    circuit_breaker_window=60,         # over 60 seconds
    circuit_breaker_reset=30,          # retry after 30 seconds
)
```

### Retry with Backoff

Network failures retry with exponential backoff before failing open.

```python
config = ZentinelleConfig(
    max_retries=3,
    retry_base_delay=0.1,     # seconds
    retry_max_delay=2.0,
)
```

### Event Buffering

Events are buffered in memory and flushed periodically. If the flush fails, events are queued for retry. Buffer is flushed on client close.

```python
config = ZentinelleConfig(
    batch_size=100,           # flush when buffer hits 100 events
    flush_interval=5.0,       # or every 5 seconds
    max_buffer_size=10000,    # drop oldest events if buffer exceeds this
)
```

### Config Caching

Last-known-good config is cached locally. If Zentinelle is unreachable, the cached config is used. Evaluate decisions use stale-but-safe policy set.

```python
config = ZentinelleConfig(
    cache_ttl=300,                # 5 min in-memory cache
    cache_stale_on_error=True,    # use cached config if fetch fails
)
```

---

## Secrets

```python
secrets = await client.get_secrets()
openai_key = secrets["OPENAI_API_KEY"]
```

Secrets are fetched over TLS and decrypted server-side. Never stored in agent code or environment variables. Scoped to the agent's grant.

---

## Configuration Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `api_key` | required | Agent API key from registration |
| `endpoint` | required | Zentinelle service base URL |
| `fail_open` | `true` | Allow requests if Zentinelle unreachable |
| `cache_ttl` | `300` | Seconds to cache config/policy set |
| `batch_size` | `100` | Events to buffer before flush |
| `flush_interval` | `5.0` | Seconds between event flushes |
| `max_retries` | `3` | Retries on transient network failure |
| `timeout` | `2.0` | Evaluate request timeout in seconds |
| `heartbeat_interval` | `30` | Seconds between heartbeats |
