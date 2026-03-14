# Policy Reference

## Policy Scope Hierarchy

Policies cascade downward. A policy at a broader scope applies to all narrower scopes unless overridden. The most specific scope wins on conflict.

```
Organization
  └── Team
       └── Deployment
            └── Endpoint (Agent)
                 └── User
```

`Policy.scope_type` defines **what the policy applies to**, not where it's stored. All policies live in the same table, filtered by `scope_type` + `scope_id`.

## Policy Evaluation Order

1. Load all active policies for the tenant
2. Filter to policies applicable to this request (matching scope chain)
3. Sort by specificity (user > endpoint > deployment > team > org)
4. Evaluate in order — first blocking policy wins
5. Apply restrictions from all non-blocking policies (accumulate)
6. Return `{ allowed, restrictions, warnings }`

## Policy Types

### Rate Limiting

```json
{
  "type": "rate_limit",
  "config": {
    "requests_per_minute": 60,
    "requests_per_hour": 1000,
    "requests_per_day": 10000,
    "burst_allowance": 10
  }
}
```

Tracks request counts per agent (or per user, if scope is user-level). Uses Redis sliding window.

---

### Cost Control

```json
{
  "type": "cost_limit",
  "config": {
    "max_cost_usd_per_day": 50.00,
    "max_cost_usd_per_month": 500.00,
    "alert_threshold_pct": 80,
    "action_on_exceed": "block"
  }
}
```

Tracks token usage cost across all 21 LLM providers using real-time pricing. `action_on_exceed` can be `block` or `alert`.

---

### Token Budget

```json
{
  "type": "token_budget",
  "config": {
    "max_tokens_per_request": 4000,
    "max_tokens_per_day": 1000000,
    "max_output_tokens": 2000
  }
}
```

Hard limit on token counts. Evaluated pre-execution against `tokens_requested`.

---

### Model Restriction

```json
{
  "type": "model_restriction",
  "config": {
    "mode": "allowlist",
    "models": ["gpt-4o", "claude-3-5-sonnet-20241022", "claude-3-haiku"],
    "deny_reason": "Only approved models are permitted in this environment"
  }
}
```

`mode` is `allowlist` (only listed models permitted) or `denylist` (listed models blocked).

---

### PII Detection

```json
{
  "type": "pii_detection",
  "config": {
    "action": "block",
    "pii_types": ["ssn", "credit_card", "email", "phone", "name", "address"],
    "scan_inputs": true,
    "scan_outputs": true,
    "redact_in_logs": true
  }
}
```

Scans request messages and/or response content. `action` is `block`, `redact`, or `alert`.

---

### Toxicity Filter

```json
{
  "type": "toxicity_filter",
  "config": {
    "threshold": 0.7,
    "action": "block",
    "categories": ["hate", "violence", "sexual", "self_harm"]
  }
}
```

Toxicity score from 0.0 (clean) to 1.0 (toxic). Block if score exceeds threshold.

---

### Jailbreak Detection

```json
{
  "type": "jailbreak_detection",
  "config": {
    "action": "block",
    "sensitivity": "medium",
    "log_attempts": true,
    "create_incident": true
  }
}
```

Detects prompt injection, jailbreak attempts, and system prompt extraction attempts. `sensitivity` is `low`, `medium`, or `high`.

---

### System Prompt Enforcement

```json
{
  "type": "system_prompt",
  "config": {
    "prompt_id": "spr_...",
    "mode": "prepend",
    "allow_override": false
  }
}
```

Enforces a specific system prompt from the prompt library. `mode` is `prepend`, `replace`, or `append`. `allow_override: false` prevents agents from changing the system prompt.

---

### Allowed Tools

```json
{
  "type": "tool_restriction",
  "config": {
    "mode": "allowlist",
    "tools": ["search", "calculator", "read_file"],
    "deny_capabilities": ["code_exec", "shell"]
  }
}
```

Restricts which tools/capabilities an agent can invoke.

---

### Time Window

```json
{
  "type": "time_window",
  "config": {
    "allowed_hours": { "start": 9, "end": 18 },
    "allowed_days": ["mon", "tue", "wed", "thu", "fri"],
    "timezone": "America/New_York",
    "action_outside": "block"
  }
}
```

Restricts agent operation to defined time windows.

---

### Geographic Restriction

```json
{
  "type": "geo_restriction",
  "config": {
    "mode": "allowlist",
    "countries": ["US", "CA", "GB"],
    "action": "block"
  }
}
```

Blocks or allows based on request origin country (via IP geolocation).

---

### Data Residency

```json
{
  "type": "data_residency",
  "config": {
    "allowed_regions": ["us-east-1", "us-west-2"],
    "providers": {
      "openai": { "allowed": true },
      "anthropic": { "allowed": true },
      "aws_bedrock": { "allowed": true, "regions": ["us-east-1"] }
    }
  }
}
```

Restricts which LLM providers and regions can be used based on data sovereignty requirements.

---

### Audit Requirement

```json
{
  "type": "audit_requirement",
  "config": {
    "log_inputs": true,
    "log_outputs": true,
    "log_tool_calls": true,
    "retention_days": 365,
    "immutable": true
  }
}
```

Forces audit logging for all interactions. `immutable: true` uses tamper-evident storage.

---

### Approval Workflow

```json
{
  "type": "approval_required",
  "config": {
    "approvers": ["role:compliance_officer", "user:admin@example.com"],
    "auto_approve_after_hours": 24,
    "scope": ["tool:delete_record", "tool:send_email"]
  }
}
```

Requires human approval before certain agent actions execute. Blocks until approved or timeout.

---

### Circuit Breaker

```json
{
  "type": "circuit_breaker",
  "config": {
    "error_threshold_pct": 50,
    "window_seconds": 60,
    "open_duration_seconds": 30,
    "min_requests": 10
  }
}
```

Opens circuit (blocks agent calls) if error rate exceeds threshold within window. Prevents cascading failures.

---

### Secrets Scope

```json
{
  "type": "secrets_scope",
  "config": {
    "allowed_secrets": ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
    "deny_secrets": ["PROD_DB_PASSWORD"]
  }
}
```

Controls which secrets from the secrets store this agent can retrieve via `/secrets`.

---

## Policy Conflicts

When multiple policies of the same type apply:
- **Blocking policies**: first block wins
- **Restrictions** (rate limits, token budgets): most restrictive wins
- **Scope specificity**: user > endpoint > deployment > team > org

## Fail-Open Behavior

If Zentinelle service is unreachable during `evaluate()`:
- Default: **fail-open** (request allowed, no policy applied)
- Per-policy override: set `"fail_open": false` in policy config to fail-closed
- SDK uses cached policy set when available

## Policy Versioning

Every policy save creates a new version. The GRC portal shows a git-like timeline. Rollback to any prior version. `dry_run: true` evaluates without enforcing.
