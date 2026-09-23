# Agent host contract

An [Agent Host Protocol](https://microsoft.github.io/agent-host-protocol/) (AHP) host runs many agent sessions across harnesses (Claude, Codex, Calliope AI) and lets several clients attach to each one. Any attached client may confirm a pending tool call, so enforcement sits in the host: before a tool call reaches its clients, the host's gate asks Zentinelle. This page is the contract between that gate and Zentinelle: identity, the `tool_call` evaluation, and the oversight hold ([#377](https://github.com/calliopeai/zentinelle/issues/377)).

The gate is additive. Hooks, the gateway and the SDKs keep governing sessions outside the host exactly as before.

## Identity: one key per host

A host registers once, as `agent_type: agent_host`, and keeps its `sk_agent_` key in the host process. Harness processes never see it. Sessions are not registered; every evaluation names its harness, session and chat in `context`.

```http
POST /api/zentinelle/v1/register
X-Zentinelle-Bootstrap: bt_<tenant_id>_<signature>
Content-Type: application/json

{"agent_id": "agenthost-dev", "agent_type": "agent_host", "name": "Agent host (dev)"}
```

```json
{
  "agent_id": "agenthost-dev",
  "api_key": "sk_agent_...",
  "config": {"heartbeat_interval_seconds": 60, "event_batch_size": 100, "event_flush_interval_seconds": 5, "config_refresh_interval_seconds": 300},
  "policies": []
}
```

A platform service can create the same identity with `POST /api/zentinelle/v1/operator/agents` and a platform or service key with the `write` scope.

Registering each session through `/register` was rejected. Sessions are short-lived and numerous, so session churn would become endpoint and key churn, every session would consume an agent entitlement, and each session's key would have to live inside the harness process the gate is policing. With one key per host, endpoint-scoped policies apply to every session the host runs, user-scoped policies follow the top-level `user_id`, and per-session attribution comes from `context`.

## Evaluating a tool call

`POST /api/zentinelle/v1/evaluate` with the host key in `X-Zentinelle-Key`.

| Field | Required | Meaning |
|---|---|---|
| `action` | yes | `tool_call` |
| `user_id` | recommended | The person driving the session. Approvals bind to it. |
| `context.harness` | yes | The provider inside the host, as a lowercase slug of up to 50 characters: `claude`, `codex`, `calliope`. |
| `context.session_id` | yes | The AHP session. Identifiers take up to 255 characters. |
| `context.chat_id` | no | The chat within the session. |
| `context.tool_call_id` | no | The pending tool call. Recommended: it binds an approval to this one call. |
| `context.tool_name` | yes | The tool, as the harness names it. |
| `context.tool_input` | no | The tool's arguments. Evaluated and bound into approvals; stored only when content capture allows. |

```json
{
  "action": "tool_call",
  "user_id": "dev@example.com",
  "context": {
    "harness": "claude",
    "session_id": "a41f0c2e",
    "chat_id": "a41f0c2e-1",
    "tool_call_id": "toolu_01",
    "tool_name": "Bash",
    "tool_input": {"command": "npm test"}
  }
}
```

A host tool call missing `harness`, `session_id` or `tool_name`, or with a malformed one, is refused before evaluation:

```json
{"error": "Invalid agent host tool_call context", "context": {"session_id": ["This field is required."]}}
```

### Decisions

| `decision` | `allowed` | The host |
|---|---|---|
| `allow` | `true` | Continues through its normal confirmation policy. |
| `deny` | `false` | Rejects the tool call and shows `reason` to every client. |
| `ask` | `false` | Holds the tool call pending; see [the oversight hold](#the-oversight-hold). |

`allowed` is `true` only for `allow`, so a client that reads only `allowed` treats `ask` as a refusal.

`allow`:

```json
{
  "contract_version": "1",
  "subject": {"tenant_id": "acme", "user_id": "dev@example.com", "endpoint_id": "6d0c4a0e-8a3b-4f8e-9d1c-2b7e5f9a1c33", "agent_id": "agenthost-dev"},
  "action": "tool_call",
  "resource": {"type": "tool", "id": "Bash"},
  "context": {"harness": "claude", "session_id": "a41f0c2e", "chat_id": "a41f0c2e-1", "tool_call_id": "toolu_01", "tool_name": "Bash", "tool_input": {"command": "npm test"}, "resource_type": "tool", "resource_id": "Bash", "trace_id": "0b6f3a52-5d0e-4f7e-9a8e-2f1d6c9b7e41", "taxonomy": {"supported": [], "unsupported": []}},
  "trace_id": "0b6f3a52-5d0e-4f7e-9a8e-2f1d6c9b7e41",
  "decision": "allow",
  "allowed": true,
  "reason": null,
  "policies_evaluated": [],
  "coverage": {"status": "unknown", "counts": {"enforced": 0, "observation_only": 0, "unsupported": 0}},
  "warnings": [],
  "output_filter_required": false
}
```

`deny` (the remaining fields as above):

```json
{
  "decision": "deny",
  "allowed": false,
  "reason": "Tool 'Bash' is explicitly denied",
  "policies_evaluated": [{"id": "c2f5...", "version": 3, "name": "No shell", "type": "tool_permission", "result": "fail", "message": "Tool 'Bash' is explicitly denied", "matched_selectors": [], "coverage": "enforced"}]
}
```

`ask` (the remaining fields as above):

```json
{
  "decision": "ask",
  "allowed": false,
  "reason": "Tool 'Bash' requires approval. Request approval before proceeding.",
  "policies_evaluated": [{"id": "8f08...", "version": 1, "name": "Shell needs a human", "type": "tool_permission", "result": "fail", "message": "Tool 'Bash' requires approval. Request approval before proceeding.", "matched_selectors": [], "coverage": "enforced"}],
  "approval": {
    "request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10",
    "status": "pending",
    "expires_at": "2026-09-22T20:05:00.412345Z",
    "timeout_seconds": 300
  }
}
```

`ask` is returned when every enforced failure is a missing human approval, and only to `agent_host` endpoints. Other agent types keep receiving `deny` for the same policies. A call that any other rule refuses is `deny`, even when it also needs approval. The policies that can ask are `tool_permission` (`requires_approval`), `agent_capability` (`require_approval`) and `human_oversight` (`require_approval_for`).

## The oversight hold

1. `/evaluate` answers `ask` with `approval.request_id`. Zentinelle opens an approval request.
2. The host keeps the AHP tool call pending. A confirmation from an attached client does not release it; only an approval does.
3. The host polls `GET /api/zentinelle/v1/approvals/requests/{request_id}` with its key, every 2 seconds or so, until the status leaves `pending` or `timeout_seconds` have passed on its own clock.
4. An operator lists pending requests and approves or denies this one; see [deciding](#deciding).
5. On `approved`, the host sends the same evaluation again with `context.approval_token` added. `allow` consumes the approval and the call proceeds; `deny` rejects it.
6. On `denied`, `expired`, or its own timeout, the host rejects the call with the reason.

The window is the shortest `approval_timeout_seconds` among the host's effective policies, at most 300 seconds. After approval, the token is valid for one use until `approval_expires_at`, also at most 300 seconds.

The approval is bound to the host, the user, the action, the current policy versions and a digest of every context field except `approval_token`, `request_id` and `trace_id`. The retry must repeat them exactly; a different session, tool, input or `tool_call_id` is denied. The retry is a full evaluation, so a policy that changed since the request was opened can still refuse it. It never answers `ask` again: once a token is presented, a failed approval check is a denial.

Each `ask` opens a new request, so hold one call per request.

### Polling

Only the host whose call is held can read the request; any other key receives `404`.

```json
{"request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10", "status": "pending", "expires_at": "2026-09-22T20:05:00.412345Z"}
```

```json
{
  "request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10",
  "status": "approved",
  "expires_at": "2026-09-22T20:05:00.412345Z",
  "approval_token": "IjRlMTIy...:1x9CZZ:r4sgb8...",
  "approval_expires_at": "2026-09-22T20:07:12.004211Z"
}
```

```json
{"request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10", "status": "denied", "expires_at": "2026-09-22T20:05:00.412345Z", "reason": "Not on the release branch"}
```

```json
{"request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10", "status": "expired", "expires_at": "2026-09-22T20:05:00.412345Z", "reason": "No approval arrived before the request expired"}
```

The retry that releases an approved call:

```json
{
  "action": "tool_call",
  "user_id": "dev@example.com",
  "context": {
    "harness": "claude",
    "session_id": "a41f0c2e",
    "chat_id": "a41f0c2e-1",
    "tool_call_id": "toolu_01",
    "tool_name": "Bash",
    "tool_input": {"command": "npm test"},
    "approval_token": "IjRlMTIy...:1x9CZZ:r4sgb8..."
  }
}
```

### Deciding

Operators decide in a portal session. Workload keys cannot call these endpoints (`401`), so no agent can approve its own work.

`GET /api/zentinelle/v1/approvals/requests` (viewer role or above) lists the tenant's pending, unexpired requests, newest first, up to 100:

```json
{
  "requests": [
    {
      "request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10",
      "agent_id": "agenthost-dev",
      "user_id": "dev@example.com",
      "action": "tool_call",
      "context": {"harness": "claude", "session_id": "a41f0c2e", "chat_id": "a41f0c2e-1", "tool_call_id": "toolu_01", "tool_name": "Bash", "resource_type": "tool", "resource_id": "Bash", "trace_id": "0b6f3a52-5d0e-4f7e-9a8e-2f1d6c9b7e41", "taxonomy": {"supported": [], "unsupported": []}},
      "reason": "Tool 'Bash' requires approval. Request approval before proceeding.",
      "trace_id": "0b6f3a52-5d0e-4f7e-9a8e-2f1d6c9b7e41",
      "expires_at": "2026-09-22T20:05:00.412345Z",
      "created_at": "2026-09-22T20:00:00.412345Z"
    }
  ]
}
```

The context shown follows the tenant's content capture mode. Under `metadata`, the default, `tool_input` is not stored, so the approver sees which tool in which session but not its arguments; set `content_capture_mode` to `redacted` or `full` to show them.

`POST /api/zentinelle/v1/approvals/requests/{request_id}/decision` (operator role or above, with the CSRF token):

```json
{"decision": "approve", "reason": "Expected test run"}
```

```json
{"request_id": "5a0d9f3e-0c77-4c1b-9d52-7f4b8f0f3e10", "status": "approved", "decided_at": "2026-09-22T20:01:12.004211Z"}
```

`decision` is `approve` or `deny`. The response is `404` for a request outside the operator's tenant and `409` once the request is decided or expired. Each decision is written to the audit log.

## Failing closed

Anything other than a `200` with `decision: allow` means the call does not run:

| Response | Meaning |
|---|---|
| `400` | The request or the host context is invalid. |
| `401` | The key is missing, unknown, suspended or revoked. |
| `403` | `agent_id` in the body does not match the key. |
| `503` | Policy evaluation is unavailable. The body is a structured `deny` with `reason: "Policy evaluation unavailable"`. |
| No response in time | Zentinelle is unreachable. The host denies. |

Every evaluation is recorded as an event for the host's endpoint, with its session context. A held call is recorded like any refusal, a `policy_violation` event, with `result.decision: "ask"` and `approval_request_id` in its payload.
