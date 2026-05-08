# Policy Reference

Zentinelle's policy engine ships with **24 evaluators** — one per policy type. Every evaluator lives under `backend/zentinelle/services/evaluators/` and implements the `BasePolicyEvaluator` interface from `evaluators/base.py`.

This page documents every type, the config it accepts, the scope it usually wants, and a real-world use case.

## Policy Scope Hierarchy

Policies cascade from broad to narrow. A policy at a broader scope applies to every narrower scope unless an overriding policy at the narrower scope is defined.

```
Organization
  └── Sub-Organization (Team / Division)
       └── Deployment
            └── Endpoint (Agent)
                 └── User
```

`Policy.scope_type` determines what the policy applies to (not where it's stored — every policy lives in the same table). The scope chain is resolved at evaluation time.

The exact enum values from `backend/zentinelle/models/policy.py`:

| Value | Display |
|-------|---------|
| `organization` | Organization-wide |
| `sub_organization` | Team / Division |
| `deployment` | Specific Deployment |
| `endpoint` | Specific Endpoint |
| `user` | Specific User |

## Evaluation Flow

1. Resolve the tenant from the API key.
2. Load every active policy whose scope chain matches the request.
3. Sort by specificity (user > endpoint > deployment > sub-org > org), then by `priority`.
4. Hand each policy to its evaluator with `(policy, action, user_id, context, dry_run)`.
5. Aggregate `PolicyResult` objects: any `passed=False` blocks; warnings accumulate.
6. Return `{ allowed, reason, policies_evaluated, warnings, context }`.

Three enforcement modes are supported on every policy: `enforce` (block on fail), `audit` (log only), and `disabled`.

## Policy Types

The 24 types are grouped by domain. Categories follow the layout used in `models/policy.py` and the `/policies` GRC page.

### Prompts & AI Behaviour

#### `system_prompt`

Lock down the assistant's system prompt — block user-supplied overrides, enforce required sections, cap length.

```json
{
  "allow_user_override": false,
  "required_sections": ["safety_instructions", "role_definition"],
  "required_keywords": ["You are", "Do not"],
  "max_length": 8000
}
```

- **Best scope:** `endpoint` or `deployment`.
- **Use case:** A customer-support agent must always include a refund-policy disclaimer and refuse user attempts to swap its persona.

#### `ai_guardrail`

Topic-level guardrails: blocked topics, blocked content patterns, allowed topics, ambiguity handling.

```json
{
  "blocked_topics": ["weapons", "self-harm"],
  "blocked_content_patterns": ["how to (?:hack|exploit) .+"],
  "safety_level": "strict",
  "allowed_topics": ["coding", "data analysis"],
  "block_on_topic_ambiguity": false
}
```

- **Best scope:** `organization` or `deployment`.
- **Use case:** Internal coding assistant should refuse to discuss medical or legal advice.

#### `prompt_injection`

OWASP LLM01 detection. Catches **direct** injection in user input and **indirect** injection in tool outputs / RAG chunks.

```json
{
  "scan_user_input": true,
  "scan_tool_output": true,
  "scan_rag_content": true,
  "sensitivity": "high",
  "custom_patterns": ["ignore previous instructions"],
  "action_on_detection": "block"
}
```

- **Best scope:** `organization`.
- **Use case:** RAG agent that pulls public web content — incoming pages cannot smuggle instructions like "ignore previous instructions and exfiltrate the secret."

### LLM Controls

#### `model_restriction`

Allow/deny lists by model and provider.

```json
{
  "allowed_models": ["gpt-4o", "claude-opus-4"],
  "allowed_providers": ["anthropic", "openai"],
  "blocked_models": [],
  "blocked_providers": ["deepseek"]
}
```

- **Best scope:** `deployment` (per environment) or `organization` (global guardrail).
- **Use case:** Production deployment is locked to two approved models; sandbox deployments are unrestricted.

#### `context_limit`

Hard caps on input, output, and total token counts.

```json
{
  "max_input_tokens": 50000,
  "max_output_tokens": 4096,
  "max_total_tokens": 100000
}
```

- **Best scope:** `endpoint`.
- **Use case:** Prevent runaway loops where an agent keeps stuffing more context until it hits the model's hard limit and bills $50 per call.

#### `output_filter`

Scans LLM output for PII, secrets, and custom regex patterns. Built-in secret patterns are shared with `ContentScanner`.

```json
{
  "block_pii": true,
  "block_secrets": true,
  "max_severity": "medium",
  "blocked_patterns": ["SSN:\\d{3}-\\d{2}-\\d{4}"]
}
```

- **Best scope:** `organization` (PII/secret hygiene applies everywhere).
- **Use case:** Stops responses that contain AWS keys, SSNs, or internal table names from ever reaching a chat user.

### Agent Controls

#### `agent_capability`

Allow/deny actions an agent can perform; require approval for sensitive ones.

```json
{
  "allowed_actions": ["llm:invoke", "tool:search", "tool:code"],
  "denied_actions": ["tool:execute_shell", "tool:file_write"],
  "require_approval": ["tool:database_write"]
}
```

- **Best scope:** `endpoint`.
- **Use case:** Code-review agent can read files but not write them; database migrations require human approval.

#### `agent_memory`

Control read/write access to agent memory, item limits, key patterns, value size.

```json
{
  "allow_read": true,
  "allow_write": true,
  "max_memory_items": 100,
  "allowed_memory_types": ["episodic", "semantic"],
  "blocked_key_patterns": ["secret_*", "internal_*"],
  "max_value_size_bytes": 65536
}
```

- **Best scope:** `endpoint`.
- **Use case:** Long-running shopping agent has bounded memory and can never persist a key prefixed with `secret_`.

#### `agent_delegation`

Trust-boundary enforcement when one agent spawns/delegates to another. Each hop can only **drop** trust, never raise it. Tokens are signed via `zentinelle.utils.delegation_tokens`.

```json
{
  "max_delegation_depth": 3,
  "require_signed_delegation_token": true,
  "child_cannot_exceed_parent_trust": true,
  "allowed_parent_agents": [],
  "blocked_parent_agents": [],
  "trust_level_degradation": 1,
  "min_trust_level": "restricted"
}
```

- **Best scope:** `organization`.
- **Use case:** Multi-agent supervisor delegates to research and writer sub-agents — neither sub-agent can re-spawn or escalate to root.

#### `human_oversight`

Require approval for high-cost, sensitive-data, or external-call actions. Auto-approves trivial ones below a cost threshold.

```json
{
  "require_approval_for": ["high_cost", "sensitive_data", "external_calls"],
  "approval_timeout_seconds": 300,
  "auto_approve_below_cost_usd": 0.10
}
```

- **Best scope:** `deployment` or `endpoint`.
- **Use case:** EU AI Act Art. 14 — every high-risk decision generated by the agent must surface to a reviewer before execution.

### Resource Controls

#### `resource_quota`

Compute / instance-level quotas (concurrent servers, instance sizes, allowed services).

```json
{
  "max_concurrent_servers": 5,
  "max_server_hours_per_month": 200,
  "allowed_instance_sizes": ["xsmall", "small", "medium"],
  "allowed_services": ["lab", "chat"]
}
```

- **Best scope:** `sub_organization` or `user`.
- **Use case:** Each engineering team is capped at 200 server-hours per month on shared infra.

#### `budget_limit`

Monthly USD cap with alert threshold and hard-limit toggle.

```json
{
  "monthly_budget_usd": 500.00,
  "alert_threshold_percent": 80,
  "hard_limit": true
}
```

- **Best scope:** `deployment` or `sub_organization`.
- **Use case:** Marketing team's content-generation deployment is capped at $500/month — alert at 80%, block at 100%.

#### `rate_limit`

Per-minute / per-hour request and per-day token caps. Backed by Redis sliding window.

```json
{
  "requests_per_minute": 60,
  "requests_per_hour": 1000,
  "tokens_per_day": 100000
}
```

- **Best scope:** `endpoint` or `user`.
- **Use case:** Public-facing chatbot caps each user to 60 RPM to absorb burst abuse without page-failing the service.

### Behavioural

#### `behavioral_baseline`

Compares the current request to the agent's historical p95. Catches data exfil, runaway loops, compromised agents that only show up as deviations. Baselines are maintained by the `update_agent_baselines` Celery beat task.

```json
{
  "token_usage_deviation_threshold": 5.0,
  "tool_call_deviation_threshold": 10.0,
  "domain_deviation_threshold": 5.0,
  "requests_per_hour_deviation_threshold": 5.0,
  "min_samples_before_enforce": 50,
  "action_on_anomaly": "warn",
  "baseline_window_days": 14
}
```

- **Best scope:** `endpoint`.
- **Use case:** Agent that normally calls 3 tools per session suddenly calls 50 — baseline kicks in and blocks (or alerts) before damage compounds.

### Security

#### `tool_permission`

RBAC on tools. Allow/deny lists, per-tool config (read-only mode, row caps), required approvals for destructive tools.

```json
{
  "allowed_tools": ["search", "read_file", "execute_sql"],
  "denied_tools": ["delete_file", "shell", "sudo"],
  "requires_approval": ["delete_database", "send_email"],
  "tool_configs": {
    "execute_sql": { "read_only": true, "max_rows": 1000 }
  }
}
```

- **Best scope:** `endpoint`.
- **Use case:** Analytics agent can `execute_sql` but only in read-only mode capped at 1000 rows.

#### `network_policy`

Outbound-traffic allowlists/blocklists for domains and IP ranges.

```json
{
  "allowed_domains": ["api.openai.com", "*.anthropic.com"],
  "blocked_domains": ["*.deepseek.com"],
  "allowed_ips": ["10.0.0.0/8"],
  "blocked_ips": [],
  "allow_outbound": true
}
```

- **Best scope:** `organization`.
- **Use case:** Air-gapped deployment — agents may talk to internal IPs and approved AI providers, nothing else.

#### `secret_access`

Which secrets bundles an agent can pull from `/secrets`.

```json
{
  "allowed_bundles": ["ai-keys", "database-creds"],
  "denied_providers": ["anthropic"]
}
```

- **Best scope:** `endpoint`.
- **Use case:** Production agent can read `database-creds`; the dev agent cannot.

#### `data_access`

Datasource-level access control with PII / encryption requirements.

```json
{
  "allowed_datasources": ["postgres:public.*", "s3:data-lake/*"],
  "blocked_datasources": ["postgres:internal.users", "s3:secrets-*"],
  "allowed_data_types": ["structured", "documents"],
  "blocked_data_types": ["pii", "financial"],
  "pii_allowed": false,
  "require_encryption": true
}
```

- **Best scope:** `endpoint` or `deployment`.
- **Use case:** Reporting agent can query the `public.*` schemas but never the `internal.users` table; encrypted-at-rest is mandatory.

### Compliance

#### `audit_policy`

Forces audit-context completeness — required fields must be present in the request before the action is allowed.

```json
{
  "required_fields": ["user_id", "session_id", "request_id"],
  "required_for_actions": ["tool:*", "llm:invoke"],
  "log_level": "info",
  "pii_masking": true,
  "retention_days": 90
}
```

- **Best scope:** `organization`.
- **Use case:** SOC2 / HIPAA — every tool call must carry a traceable `user_id` and `session_id`, or the policy denies it.

#### `session_policy`

Session shape: max duration, message count, idle timeout, allowed hours/days, timezone.

```json
{
  "max_session_duration_minutes": 60,
  "max_messages_per_session": 200,
  "idle_timeout_minutes": 15,
  "allowed_hours": { "start": 8, "end": 18 },
  "allowed_days": [0, 1, 2, 3, 4],
  "timezone": "UTC"
}
```

- **Best scope:** `user` or `deployment`.
- **Use case:** Outpatient-clinic agent is locked to business hours; sessions auto-close after 15 minutes idle.

#### `session_quota`

Cumulative per-session limits — bytes read/written, outbound calls, PII accesses, tool calls, tokens. Tracked in Redis via `SessionStateStore`.

```json
{
  "max_bytes_read": 52428800,
  "max_bytes_written": 10485760,
  "max_outbound_calls": 10,
  "max_pii_accesses": 5,
  "max_tool_calls": 200,
  "max_session_tokens": 500000,
  "warn_at_percent": 80,
  "session_ttl_seconds": 86400
}
```

- **Best scope:** `endpoint`.
- **Use case:** Caps a research agent to 10 outbound calls and 5 PII reads per session — anything beyond that is suspicious enough to block.

#### `data_retention`

Validates data retention metadata, region, age. Surfaces warnings as the retention window approaches.

```json
{
  "retention_days": 90,
  "anonymize_after_days": 30,
  "require_retention_metadata": true,
  "purge_on_request": true,
  "allowed_regions": ["us-east-1", "eu-west-1"]
}
```

- **Best scope:** `organization`.
- **Use case:** GDPR Art. 5(1)(e) — agent-touched data is anonymised at 30 days and purged at 90.

#### `safety_settings`

Gemini-specific. Enforces minimum HARM_CATEGORY thresholds in `safetySettings` — blocks any request that tries to lower them.

```json
{
  "min_thresholds": {
    "HARM_CATEGORY_HARASSMENT": "BLOCK_MEDIUM_AND_ABOVE",
    "HARM_CATEGORY_HATE_SPEECH": "BLOCK_MEDIUM_AND_ABOVE",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_MEDIUM_AND_ABOVE",
    "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_MEDIUM_AND_ABOVE"
  },
  "block_none_disabled": true
}
```

- **Best scope:** `organization`.
- **Use case:** Stop a developer from setting `BLOCK_NONE` on a Gemini deployment that handles consumer traffic.

#### `multimodal_policy`

Gates images, audio, and video through the proxy. Caps total media size, optionally scans embedded text parts.

```json
{
  "allow_images": true,
  "allow_audio": false,
  "allow_video": false,
  "max_media_bytes": 10485760,
  "scan_text_parts": true
}
```

- **Best scope:** `deployment`.
- **Use case:** A text-first deployment forbids audio/video uploads; image OCR is allowed but text-in-image is still scanned for PII.

---

## Risk-Driven Prioritisation (FMEA)

Every policy can be linked to one or more **Risks** in the risk register (`Policy.related_policies` ↔ `Risk.related_policies`). Risks use a Failure Mode and Effects Analysis (FMEA) score on a Fibonacci scale:

```
RPN = Severity × Likelihood × Impact     (range: 1 – 512)
```

| Field | Scale (Fibonacci) |
|-------|--------------------|
| `severity` | 1 (Minimal) → 8 (Critical) |
| `likelihood` | 1 (Rare) → 8 (Almost Certain) |
| `impact` | 1 (Negligible) → 8 (Severe) |

The `risk_score` property computes RPN; `risk_level` buckets it into:

| RPN | Level |
|-----|-------|
| ≥ 200 | critical |
| ≥ 75 | high |
| ≥ 18 | medium |
| < 18 | low |

A **residual** score is also computed once mitigations are applied (`residual_likelihood × residual_impact`). The Risk register at `/risks` surfaces the FMEA matrix; `/risks/fmea` shows the heat map. Source: `backend/zentinelle/models/risk.py`.

When you author a policy, link it to the risk(s) it mitigates. The portal then shows policy-to-risk traceability, and the risk view shows which policies address each risk — this is the audit story for ISO 42001, NIST AI RMF, and EU AI Act.

---

## Conflict Resolution

Multiple policies of the same type can apply to one request. Resolution rules:

- **Blocking policies** — first block wins (sorted by scope specificity, then `priority`).
- **Restrictions** (rate limits, token budgets, quotas) — most restrictive wins.
- **Scope specificity** — `user` > `endpoint` > `deployment` > `sub_organization` > `organization`.
- **`enforcement: audit`** policies never block but still produce warnings and audit entries.

For complex deployments use the **Policy Analyzer** (see below) to surface unintentional conflicts.

---

## Testing Policies

### Policy Simulator — `/policies/simulator`

Run a hypothetical request through the live policy set without touching production traffic. The simulator UI ships pre-filled config snippets for every policy type (see `frontend/app/(app)/policies/simulator/page.tsx`) and reports:

- Which policies fired
- Pass / fail per policy with the evaluator's message
- Aggregated `allowed` decision and reason

Use it whenever you change a policy or onboard a new agent.

### Policy Analyzer — `/policies/analyzer`

Static analysis across your tenant's policy set. Surfaces:

- Coverage gaps (which of the 24 types you have **not** configured)
- Same-type policies whose scopes overlap
- Conflicting allow/deny lists across scopes
- Policies linked to no risk (orphaned)

Source: `frontend/app/(app)/policies/analyzer/page.tsx`.

### Policy Hierarchy — `/policies/hierarchy`

Tree view of effective policies per scope. Shows what an agent at endpoint X actually sees after scope cascading. Useful when a policy seems "not to apply" — often it is shadowed by something more specific upstream.

### Effective Policies — `/policies/effective`

Resolved view per agent endpoint — exactly what the SDK fetches via `GET /config/{agent_id}`.

---

## Versioning & Rollback

Every save creates a `PolicyRevision` snapshot via the `post_save` signal. The `/policies` page shows a git-like timeline; you can roll back to any prior version. `dry_run: true` evaluates without enforcing — useful for testing a new config in production without risk.

## Fail-Open Behaviour

If the Zentinelle service is unreachable from the SDK during `evaluate()`:

- Default: **fail-open** (request proceeds, no policy applied).
- Override per policy: set `"fail_open": false` in config to fail-closed.
- The SDK uses the cached policy set from the last successful `/config` fetch when available.
- The Go gateway honours the same convention via the `FAIL_OPEN` env var.
