# Zentinelle assistant on AG-UI

Issue: zentinelle#447. Companion: [ui-overhaul-ia.md](ui-overhaul-ia.md), for zentinelle#446.

Status: proposal for review. No code until it is approved.

Base: `main` at `d7f72f8` (2026-10-16). Protocol: [AG-UI](https://github.com/ag-ui-protocol/ag-ui), schema `spec/1.0/schema.json`.

## 1. Summary

- **What.** One assistant, docked on every page. It onboards a tenant (five questions, then one reviewable baseline on top of the seeded policies), answers questions from live data, and takes people to the right page.
- **How.** A Pydantic AI agent in an ASGI process of the Zentinelle backend streams AG-UI events over SSE to the dock.
- **Governed.** The assistant is an agent endpoint of its tenant. Every model call goes through Zentinelle's own policy engine and metering, in process.
- **Models.** On AWS, Claude in Amazon Bedrock through the backend's task role, so no keys are stored. Elsewhere, the shared in-cluster model or a tenant provider key.
- **Writes are proposals.** The agent never writes. A person approves a diff the server rendered, and the change lands as a policy change set under that person's identity and role.
- **Tools.** 18 read tools, 2 propose-only write tools and 1 structured question, all run as the signed-in user; and 2 frontend tools, `navigate` and `highlight`, run by the browser.

## 2. What exists today

| Piece | Where | What happens to it |
|---|---|---|
| Chat endpoint `POST assistant/chat`: a sync DRF view that bridges an async loop through a thread and a queue, and sends custom `data:` JSON lines | `backend/zentinelle/api/views/assistant.py` | replaced by the AG-UI endpoint |
| 22 tools (`TOOL_SCHEMAS`, `TOOL_DISPATCH`), 11 of them writes (`MUTATION_TOOLS`), each a function over the ORM with a tenant filter | `backend/zentinelle/services/llm_tools.py` | reads reused behind the new rules; direct writes dropped |
| Provider loops for Anthropic, OpenAI-compatible providers and Gemini; direct provider calls with the tenant's `LLMProviderKey`, else an environment key; the preflights `_check_model_route` and `_check_tool_route`, audited as `model_route.allowed` and `model_route.denied` | `backend/zentinelle/services/llm_provider.py` | loops replaced by Pydantic AI; both preflights kept |
| Approval records of `kind='assistant'`: bound to an exact argument digest, single use, valid at most 300 s | `backend/zentinelle/services/approvals.py` | kept; they bind every human decision |
| Policy copilot: draft (keyword inference), explain, diff with a 7-day replay, and stage into a `PolicyChangeSet` | `backend/zentinelle/api/views/policy_copilot.py` | kept as services behind the tools; the page goes |
| Staged policy changes: base-version check, snapshots, rollback; approve, promote and roll back need the admin role | `backend/zentinelle/services/policy_rollout.py`, `backend/zentinelle/api/views/policy_change.py` | the only write path |
| Guardrails: a topic allowlist, the tenant's `prompt_injection` and `ai_guardrail` policies, injection patterns | `backend/zentinelle/services/assistant_guardrails.py` | kept, and extended to tool results |
| Runtime settings `assistant_model`, `assistant_provider`, `assistant_allowed_topics` and `policy_copilot_enabled` (admin, staged, with rollback) | `backend/zentinelle/api/views/runtime_settings.py` | extended |
| Shared in-cluster model: `LMSTUDIO_URL`, `DEFAULT_LLM_PROVIDER=lmstudio`, `ASSISTANT_MODEL` (calliope-installer#446) | `shared_model_id()` in `backend/zentinelle/services/llm_provider.py` | the default outside AWS |
| Seeded baseline (calliope-installer#431) | `backend/zentinelle/management/commands/seed_integration_policies.py` | what onboarding builds on |
| `ChatBubble` on every page, `use-chat`, `/assistant`, `/policies/copilot` | `frontend/components/ChatBubble.tsx`, `frontend/hooks/use-chat.ts` | replaced by the dock |

Gaps this design closes:
- Model traffic skips Zentinelle's own policy engine and metering, and still falls back to environment keys, which the proxy and the gateway no longer do since #448.
- Long streams run on two sync gunicorn workers with a 60 s timeout (`backend/Dockerfile`), the same workers that answer `/evaluate`.
- No interrupts, resume or shared state; approval is a second REST call outside the stream.
- Tool results are not yet treated as untrusted input; only approved arguments are scanned.
- Tools run with a tenant id rather than the user's request, and writes skip the staged change workflow.

## 3. Architecture

```
Browser: the dock
  @ag-ui/client HttpAgent, fetch = authenticatedFetch (session cookie + CSRF)
  frontend tools: navigate, highlight
        |  POST RunAgentInput                       ^  SSE: AG-UI events
        v                                           |
Zentinelle assistant process (ASGI, same image as the backend)
  POST /api/zentinelle/v1/assistant/agui
  session, role and tenant of the signed-in user
  Pydantic AI agent, AGUIAdapter.run_stream()
    read tools      -> the GraphQL operations and REST views the UI uses, as the user
    proposal tools  -> interrupt -> on approval, a policy change set, as the user
    model client    -> governed transport, in process:
                         PolicyEngine.evaluate(assistant endpoint, 'llm:invoke')
                         -> Bedrock on AWS, the shared in-cluster model, or a tenant key
                         -> output filter, InteractionLog, canonical usage ingest
```

## 4. Tools

### 4.1 Rules for every tool

1. **As the user.** A tool calls the same GraphQL operation (guarded by `PortalRoleExtension` in `backend/zentinelle/schema/access.py`) or REST view the UI calls, with the user's request. No tool touches the ORM directly or holds a service credential. The tool list is built per run from the user's role, so the model never sees a tool the user could not use.
2. **Results are data.** Every result is a typed envelope. Free text that someone else controls is marked, capped and scanned before the model reads it (9.2).
3. **Small results.** Ids, names, counts and short fields; never raw payloads or captured content.
4. **Audited.** Every call writes a record (9.5).
5. **Names** follow the registry's convention: snake_case, verb then noun, scoped to the tenant.

### 4.2 Read tools

| Tool | Returns | API | Role |
|---|---|---|---|
| `get_onboarding_status` | onboarding progress, which baseline policies exist, agents registered, providers seen, integrations connected, the resolved model route | new `GET assistant/onboarding` | viewer |
| `list_policies` | policies by type, scope, mode and action | GraphQL `GetPolicies` | viewer |
| `get_policy` | one policy with its config, version and recent history | GraphQL `GetPolicy`; REST `policies/{id}/history/` | viewer |
| `resolve_effective_policies` | what is in effect for an agent, or for a user at that agent | REST `effective-policy?endpoint=` and `effective-policy/{user_id}` (portal session since #448) | viewer |
| `simulate_policy_change` | a draft replayed over 7 days: events matched, would block, inconclusive | GraphQL `SimulatePolicy` | viewer |
| `list_policy_changes` | staged change sets and their status | REST `GET policy-changes` | viewer |
| `list_agents` | agents with type, status, health and group | GraphQL `GetEndpoints` | viewer |
| `get_agent` | one agent; for admins, also its controls | GraphQL `GetEndpoint`; REST `agents/{id}/control` | viewer; controls admin |
| `list_approval_requests` | held actions waiting for a person | REST `GET approvals/requests` | viewer |
| `get_usage` | tokens, calls and cost by agent, model and provider over a range | GraphQL `GetUsageMetrics` | viewer |
| `get_budget_status` | budget policies and spend this month | GraphQL `GetPolicies` for `budget_limit`; REST `budgets/showback` | viewer |
| `search_audit_log` | audit records by action, resource, actor and time | GraphQL `GetAuditLogs` | viewer |
| `verify_audit_chain` | the integrity result of the audit chain | REST `audit/verify` | viewer |
| `list_alerts` | open compliance alerts | GraphQL `ComplianceAlerts` | viewer |
| `list_incidents` | open incidents | GraphQL `GetIncidents` | viewer |
| `list_risks` | open risks by RPN | GraphQL `GetRisks` | viewer |
| `get_compliance_overview` | framework coverage and gaps | GraphQL `GetComplianceOverview` | viewer |
| `list_models` | registered models, approvals, prices and availability | GraphQL `AiModels` | viewer |

### 4.3 Propose-only write tools

| Tool | Proposes | Applied through, on approval | Who can approve |
|---|---|---|---|
| `propose_policy_change` | one change set: up to 10 policy creates or updates, each with a rationale | `POST policy-changes` as the user, then its transitions: validated and staged; for an admin also approved and promoted (`promote_change_set` in `backend/zentinelle/services/policy_rollout.py`) | operators stage; admins promote |
| `propose_onboarding_baseline` | the change set the onboarding answers produce, on top of the tenant's current organization-wide policies (section 5) | the same path, titled "Onboarding baseline" | admins |

**The v1 cap on every proposal:** enforcement stays `audit`; the action is `log` or `alert`; budgets keep `hard_limit` false; no disable, delete, `non_overridable` or `override_group`. Under enforce, a rule that cannot be evaluated refuses the call whatever its action (`bootstrap.md`, "Policy Actions"), so even an alerting rule can block once it is enforced. Tightening stays a person's choice, in the policy editor. The cap lifts only once step-up exists (9.1).

**Approval flow:**
1. The model calls `propose_policy_change`.
2. The handler, as the user, checks the draft against the policy type's config schema (audit PR 13), applies the cap, captures base versions, computes the diff and the 7-day replay, and issues an approval record: `issue_approval(kind='assistant', subject=<user id>, action='propose_policy_change', context=<normalized arguments>)`. It writes `assistant.proposal.created`.
3. The run ends with `RUN_FINISHED`, outcome `interrupt`. Each interrupt carries `id` (the approval id), `reason: "policy_change_approval"`, `toolCallId`, `message`, `expiresAt`, a `responseSchema` (`approved`, and an optional `reason`) and `metadata.proposal`, the diff and impact the server computed.
4. The dock renders the card from `metadata.proposal`, never from model text: per policy, before and after, mode and action, scope, replay counts, and who must approve. Buttons: Approve, Reject, and Edit in the policy editor, which opens the editor with the draft filled in and leaves the assistant flow.
5. Approve posts a new run with `resume: [{interruptId, status: "resolved", payload: {approved: true}}]`. The server finds the approval by id, user, tenant, action and the digest of the stored arguments; consumes it once; re-checks the cap and the base versions; creates the change set with `created_by` set to the user; and moves it as far as the user's role allows. It writes `assistant.proposal.approved` with the change set id. The change set's own transitions and promotion write their usual records, and promoted policies carry the user in `_changed_by`.
6. Reject or cancel (`approved: false`, or `status: "cancelled"`) writes nothing but `assistant.proposal.rejected`. An approval older than 300 s has expired, and the card offers "Propose again".
7. Edited arguments (`editedArgs` in Pydantic AI's resume payload) are refused. An edit goes through the editor or a new proposal, so the diff a person approved is always the server's.

### 4.4 Structured question

| Tool | Does | Role |
|---|---|---|
| `ask_onboarding_question` | pauses the run with an interrupt whose `reason` is `onboarding_question` and whose `responseSchema` describes the answer; the dock renders a form; the server validates the answer against the schema and stores it | admin |

A typed answer such as "2000" or "regulated" never goes through the free-text topic check, which would refuse it for lack of a Zentinelle term (`check_support_message` in `backend/zentinelle/services/assistant_guardrails.py`).

### 4.5 Frontend tools

Declared by the dock in `RunAgentInput.tools` and run by the browser. Results go back as a `tool` message in the next run.

| Tool | Arguments | What the browser does |
|---|---|---|
| `navigate` | `route`, optional `params` and `query` | routes with the Next router, but only to a route in the navigation model or the redirect table; anything else is refused and reported |
| `highlight` | `anchor`, `message` | shows a popover on a `data-tour` anchor of the current page, with the driver.js engine that `frontend/components/DemoTour.tsx` already uses; a missing anchor reports `not_found` |

### 4.6 What happens to today's 22 tools

- `list_agents`, `get_agent_details`, `list_policies`, `get_policy_details`, `list_open_incidents`, `list_open_risks`, `list_open_alerts` and `verify_audit_chain` become the read tools above, moved to the API layer.
- `list_recent_events` is left out of v1; the audit log and the alerts cover onboarding.
- `create_policy`, `update_policy` and `toggle_policy` fold into `propose_policy_change`.
- `create_risk`, `update_risk`, `resolve_incident`, `acknowledge_incident`, `acknowledge_alert`, `review_risk`, `run_compliance_check` and `generate_compliance_report` are out of v1. An acknowledgement hides a signal, so it should never start from a model.
- `navigate_to` becomes the frontend tool `navigate`.
- `suggest_policies_for_gaps` becomes `get_compliance_overview` plus a proposal.

## 5. Onboarding

### 5.1 The baseline it builds on

When Zentinelle is enabled with the Workbench or with Astrolift, `seed_integration_policies` creates three organization-wide policies for the tenant, in audit mode with the alert action, as decided on 2026-10-16 and merged in #448:

| Policy | Seeded config |
|---|---|
| `agent_delegation` | `max_delegation_depth` 3, `child_cannot_exceed_parent_trust` true |
| `human_oversight` | `require_approval_for` `high_cost` and `sensitive_data`, `approval_timeout_seconds` 300 |
| `budget_limit` | `monthly_budget_usd` 500, `alert_threshold_percent` 80, `hard_limit` false |

A type the tenant already has is skipped, so onboarding reads the tenant's actual policies and never assumes the seed.

Engine facts that shape v1:
- Since #448, a soft budget alerts at its threshold (audit H22), and `human_oversight` prices a call on the server (H19). A call whose cost the server cannot bound, such as an unpriced model or a request without a token limit, still counts as high cost.
- Still open: compliance packs write some keys the evaluators do not read (H20); `agent_delegation` is not yet dependable (H21); `block_pii` flags ordinary output (H23). So onboarding proposes no pack as coverage, does not lean on delegation, and leaves PII output filtering out until H23 is fixed.

### 5.2 Questions

| # | Question | Answer | Maps to | Proposal on top of the baseline |
|---|---|---|---|---|
| 1 | How many people will run or manage agents in the next 90 days? | 1 to 10, 11 to 50, 51 to 250, or more than 250 | `rate_limit` | `requests_per_minute` per agent of 60, 120, 300 or 600. A weak signal, so the question can be skipped. Above 50 it also suggests agent groups, as a link rather than a write. |
| 2 | What is your monthly AI spend limit in US dollars, and should agents be flagged or stopped at it? | a number; flag or stop | `budget_limit` | `monthly_budget_usd` set to the answer, `alert_threshold_percent` 80, `hard_limit` false, action alert. "Stop" is not proposed: the card says that blocking is set in the policy editor, and links to it. |
| 3 | Which agent actions should a person approve first? | any of: costly calls, sensitive data, calls to outside services, specific tools picked from the tool names seen in this tenant's events | `human_oversight`, `tool_permission` | `require_approval_for` with `high_cost`, `sensitive_data` and `external_calls` as picked; `tool_permission` `requires_approval` with the picked tools. In audit with the alert action, a call that would have been held is recorded and alerted. |
| 4 | What is the most sensitive data your agents touch? | public, internal, confidential or regulated; if regulated, which: personal data, health data, card data, EU personal data | `output_filter`, `prompt_injection`, `data_access`, `audit_policy` | Internal and above: `output_filter` `block_secrets` true. Confidential and above: `prompt_injection` `sensitivity` high, with `scan_tool_outputs` and `scan_rag_context`. Regulated: `data_access` `pii_allowed` false and `audit_policy` `pii_masking` true; the matching compliance framework is pointed to, not activated. |
| 5 | Which agents and model providers do you use? | prefilled from this tenant's agents and interaction logs; confirm or edit | `model_restriction` | `allowed_providers` set to the confirmed list, so use of any other provider is recorded and alerted. Next steps link to registering the missing agents and to Settings > Integrations. |

### 5.3 How a proposal is built

- A deterministic mapper in server code turns answers into changes, with a unit test per row of 5.2. The model asks, explains and summarizes; it does not write onboarding config. That keeps onboarding reliable on small local models too.
- For each mapped type: if an organization-wide policy of that type exists, propose an update of its config fields only, never of its mode or action. Otherwise propose a create at organization scope, in audit mode, with the alert action.
- One change set, titled "Onboarding baseline", with one item per policy, each naming the answer that produced it.
- The v1 cap of 4.3 applies.
- Onboarding is admin-led, since it changes organization-wide policy. An operator gets "ask an admin" and a link; a viewer can still ask questions.

### 5.4 Shared state

AG-UI shared state carries onboarding progress. The server is the source of truth, in the `onboarding` key of `TenantConfig.settings`. It sends `STATE_SNAPSHOT` when a run starts and `STATE_DELTA` (JSON Patch) as answers arrive. State the client sends back is advisory; the server re-reads its own.

```json
{
  "onboarding": {
    "status": "in_progress",
    "step": "budget",
    "answers": {"team_size": "11-50", "monthly_budget_usd": 2000},
    "baseline": {"agent_delegation": "present", "human_oversight": "present", "budget_limit": "present"},
    "proposal": {"change_set_id": null, "status": "none"},
    "next": ["/usage/budgets", "/alerts", "/audit-logs"]
  },
  "page": {"route": "/policies", "entity": null}
}
```

The onboarding card on Overview reads the same server state, so progress shows outside the dock too.

### 5.5 After the baseline is applied

The assistant uses `navigate` and `highlight` to show:
- Usage > Budgets: spend against the new limit.
- Activity > Alerts: where would-have-been holds and budget alerts appear.
- Activity > Audit log: the change set and the assistant's own records.
- Agents > Approvals: where held actions wait once a policy asks for a person.

## 6. Agent framework

| | Pydantic AI | AWS Strands | Keep the in-house loop |
|---|---|---|---|
| AG-UI | `AGUIAdapter.run_stream()`, documented for frameworks not built on Starlette, Django among them | `ag_ui_strands`: `StrandsAgent`, served by FastAPI (`add_strands_fastapi_endpoint`, `create_strands_app`) | none; custom events mapped by hand |
| Human in the loop | `requires_approval=True` tools with `DeferredToolRequests`; the stream ends with `RUN_FINISHED`, outcome `interrupt`, and resumes from `resume[]` (needs `ag-ui-protocol` 0.1.19 or later) | `interrupt_on_call`; refuses a new turn while an interrupt is pending (`PENDING_INTERRUPTS`) or another run is active (`THREAD_BUSY`) | today's `pending_action`, plus a separate REST call |
| Shared state | `StateDeps[Model]` and the `StateHandler` protocol, validated per request | `state_context_builder`, `ToolBehavior.state_from_args` and `state_from_result` | none |
| Trust | client messages untrusted; the system prompt stays the server's by default (`manage_system_prompt='server'`); client context is data | hook exception text reaches the browser verbatim, and the Python adapter defaults to a wildcard CORS origin (its own `ARCHITECTURE.md`) | n/a |
| Models | Anthropic Messages, with `AsyncAnthropicBedrockMantle` accepted as the client; OpenAI-compatible; Bedrock Converse; others | Bedrock first; others through providers | three hand-written loops in `backend/zentinelle/services/llm_provider.py` |
| Fit | in process with Django: the same auth, ORM and tests | a second web framework next to Django, and a bridge for sessions and CSRF | no new dependency |

**Recommendation: Pydantic AI.**
- Strands' strongest point is direct Bedrock access, which the governed path deliberately does not use (7.3). It would also bring FastAPI and a second auth stack into a Django product.
- The in-house loop has no interrupts, resume or state, and grows by one loop per provider.
- Precedent: zentinelle-sdk already ships a Pydantic AI plugin, in its CI matrix.
- Dependency: `pydantic-ai-slim[ag-ui]`, which brings `ag-ui-protocol` and `starlette`, pinned to a release that maps approvals to interrupts.

## 7. Models

### 7.1 AWS: Claude in Amazon Bedrock

- **Endpoint.** The Messages API at `https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages`: standard SSE and the same request body as Anthropic's own API, for Claude Opus 4.7 and later and for Claude Haiku 4.5. Structured outputs are not offered there, so the design uses tool calls only.
- **Auth.** SigV4 for the `bedrock-mantle` service with the backend's task role, through `AsyncAnthropicBedrockMantle`, which Pydantic AI accepts as its Anthropic client. IAM: `bedrock-mantle:CreateInference` on the allowed model ARNs, granted by the installer. No stored keys and no bearer tokens.
- **Default model:** `anthropic.claude-sonnet-5-5`, which Anthropic describes as the best combination of speed and intelligence. If the account has no access to it, fall back to `anthropic.claude-sonnet-5`, which Bedrock opens to every customer. Faster and cheaper: `anthropic.claude-haiku-4-5` (open to all) or `anthropic.claude-haiku-5-5` (access varies).
- **No baked values.** The model id is the runtime setting `assistant_model`, written by the installer for each install and changeable by an admin.
- **Endpoint type.** Global (dynamic routing, no premium) by default; regional (in-region, a 10 percent premium) when a tenant needs data residency. Traffic stays inside AWS under the customer's account either way, and only the regional endpoint also keeps it in one region.
- **Price it.** The shipped price catalog (`backend/zentinelle/services/model_prices.py`) lists first-party ids such as `claude-sonnet-5-5`, and pricing matches exact ids. Without a registry price for the Bedrock id, every assistant call has an unknown cost, and the seeded `human_oversight` policy flags each one as high cost. So the Bedrock ids get their own prices, since Bedrock prices differ, and every call sets a token limit.

### 7.2 Other installs

In order:
1. **The shared in-cluster model** (calliope-installer#446): `LMSTUDIO_URL`, `DEFAULT_LLM_PROVIDER=lmstudio` and `ASSISTANT_MODEL`, read today by `shared_model_id()`, over the OpenAI-compatible chat API. It needs a model with tool calling and the matching vLLM tool parser.
2. **A tenant provider key** marked `enabled_for_assistant` (`LLMProviderKey`), for any provider the registry supports.
3. **Otherwise the assistant is off,** and the dock says what to configure.

There is no fallback to environment keys, the rule the proxy and the gateway follow since #448 (`ALLOW_ENV_PROVIDER_KEYS`). On a weak local model onboarding still works, because its questions and proposals are deterministic (5.3); free-form answers degrade.

### 7.3 Governed and metered

- **An agent of its tenant.** The assistant is an agent endpoint: `agent_id` `zentinelle-assistant`, `agent_type` `chat`, created on first use. It is a system agent, so it does not count against the tenant's agent entitlement. It can be suspended like any agent, and its traffic shows on its agent page.
- **A governed transport.** Every model call goes through an HTTP transport handed to the model client; the Anthropic and OpenAI SDKs both take a custom HTTP client. The transport runs the Django proxy's steps in process: `PolicyEngine.evaluate(endpoint, 'llm:invoke', context)` before the call, the output filter on the response, then `InteractionLog` and usage, with the portal user recorded. Content capture follows the tenant's `content_capture_mode`, metadata by default.
- **One implementation.** The proxy's steps move into one service function that both the proxy view and the transport call.
- **Usage through the canonical ingest.** The transport records usage with `usage_ingest.record_usage_event` and a request id the server generates. That closes, for the assistant, the gap #448 notes for the proxy under "Follow-ups found while merging".
- **What applies.** Budgets, model restrictions, rate limits and output filters apply to the assistant, and its spend counts against the tenant's budgets.

Why not an HTTP hop:
- **The Go gateway** is not deployed by the installer on ECS installs (#388 is parked), knows three providers (`gateway/provider.go`), and has no Bedrock upstream.
- **The Django proxy over HTTP** would call back into the same two sync workers, and two concurrent chats could hold both. The proxy is also meant to give way to the gateway (#380, `memory.md`).

The transport is pluggable: an install that runs a gateway can point the model client at it with the assistant's agent key, as a configuration change.

## 8. Transport and runtime

### 8.1 Endpoint

- `POST /api/zentinelle/v1/assistant/agui` takes a `RunAgentInput` (`threadId`, `runId`, `messages`, `tools`, `context`, `state`, `forwardedProps`, `resume`) and answers `text/event-stream` with AG-UI events.
- Session auth plus CSRF: `authenticatedFetch` sends `X-CSRFToken`. Same origin. `Cache-Control: no-cache` and `X-Accel-Buffering: no`.
- An SSE comment every 15 s, so that proxies with a 60 s idle timeout do not close a quiet stream.
- Also: `GET assistant/onboarding` (viewer), and the existing admin settings endpoints.

### 8.2 Process model

The backend runs `gunicorn config.wsgi:application --workers 2 --timeout 60` (`backend/Dockerfile`). A stream holds a sync worker for its whole length, and dies at 60 s.

The proposal is to serve the assistant endpoint from its own ASGI process, built from the same image: `uvicorn config.asgi:application`, with Django 6.1 async views and `StreamingHttpResponse` over an async iterator. The edge routes `/api/zentinelle/v1/assistant/agui` to it: an ECS service in the installer's topologies, a compose service behind Caddy, a Deployment on Kubernetes. Long streams then never compete with `/evaluate`, the policy path every agent depends on.

| Option | For | Against |
|---|---|---|
| Separate ASGI process (recommended) | streams isolated from `/evaluate`; scales on its own | one more service in each topology |
| gthread workers on the existing service | the smallest change; fine for a first demo | streams still share capacity with `/evaluate` |
| The whole backend on ASGI | one process | changes every sync view and the database connection model as a side effect; rejected |

### 8.3 Event mapping

| AG-UI event | The dock |
|---|---|
| `RUN_STARTED` | marks the run active; Stop replaces Send |
| `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` | the assistant's message. v1 holds the final text until the output check passes, as today, so it arrives whole |
| `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END` | an activity row with a plain label, such as "Reading policies"; the arguments of read tools are not shown |
| `TOOL_CALL_RESULT` | the row turns done, with a short summary such as a count |
| tool calls to `navigate` or `highlight` | the browser runs them and returns the result in the next run |
| `STEP_STARTED`, `STEP_FINISHED` | a step label, such as "Checking your baseline" |
| `STATE_SNAPSHOT`, `STATE_DELTA` | onboarding progress, in the dock and on Overview |
| `RUN_FINISHED`, outcome `interrupt` | each interrupt by its `reason`: `policy_change_approval` as the proposal card, `onboarding_question` as a form built from `responseSchema` |
| `RUN_FINISHED`, outcome `success` | idle |
| `RUN_ERROR` | a message with Retry, and the code for support |
| `CUSTOM` named `zentinelle.guardrail_denied` | a refusal note with the reason, and no model text |
| `MESSAGES_SNAPSHOT` | restores a thread after a reload |
| `REASONING_*` | not shown; a "thinking" indicator only |

### 8.4 Frontend

- **Client.** `@ag-ui/client` `HttpAgent({ url, fetch: authenticatedFetch })`. The `fetch` option carries the session cookie and the CSRF header, so there is no CopilotKit runtime and no Node hop.
- **Storybook first.** The dock and its parts are built against recorded event streams, one story per sequence: a plain answer, tool calls, a proposal, a question, an error, a guardrail refusal, an expired approval.
- **Generative UI.** The proposal card and the question form are frontend components chosen by the interrupt's `reason`. The server sends data, never markup.
- **Markdown.** No images and no raw HTML. Links go only to console routes; anything else shows as plain text.
- **Context.** The dock sends the route and the page header's entity (type and id) in `RunAgentInput.context`, and the server treats it as data.

### 8.5 What replaces what

| Today | After |
|---|---|
| `/assistant` | the dock and its full-width mode; the route redirects |
| `/policies/copilot` | the proposal flow, plus Policies > Changes; the route redirects |
| `ChatBubble`, `use-chat` | the dock (`frontend/components/assistant/`) |
| `POST assistant/chat`, `POST assistant/execute-tool` | `POST assistant/agui`; the old two are removed one release later |
| `policy-copilot/draft`, `explain`, `diff`, `stage` | services behind the tools; their REST endpoints go with the page |
| runtime setting `policy_copilot_enabled` | `assistant_enabled`, next to `assistant_model` and `assistant_provider` |
| `assistant/providers`, `assistant/models` | kept, for Models > Providers |

## 9. Security

### 9.1 No privilege beyond the user

- **One identity:** the signed-in user's session. The assistant process has no service account, no API key and no database access beyond the backend's own.
- **Reads** go through the API layer with the user's request. The tool list follows the role. The tenant comes from the session, never from arguments or context.
- **Writes** happen only as change sets the user approves. Promotion keeps its admin requirement, and the assistant cannot stage, approve or promote on its own.
- **Step-up.** Zentinelle has none today. v1 does not need it, because the cap in 4.3 keeps every proposal in audit mode. Step-up, meaning re-authentication within minutes or OIDC `max_age`, comes before the cap lifts.
- **Two tenants.** Every new endpoint and tool gets a two-tenant test on the fixtures #448 added (`backend/zentinelle/tests/_two_tenants.py` and `_two_tenants_portal.py`).

### 9.2 Prompt injection from tool results

What the model reads that someone else controls: agent names and descriptions, event payload fields, alert and incident text, policy and risk descriptions, interaction metadata, and tool names from telemetry.
- **Typed envelopes.** Results are JSON with typed fields. Free text sits in marked fields, capped at 200 characters by default, and is never joined into instructions.
- **Scanning.** Every result passes `check_untrusted_content` and, where the tenant has one, its `prompt_injection` policy with `scan_tool_outputs`. A hit replaces the field with a notice and writes `assistant.guardrail_denied` with the boundary `tool_result`.
- **Containment.** Even a model that follows an injected instruction can only read what the user can read, propose changes a person approves on a server-rendered card, and move around the console. No tool sends data out, and the dock renders no external links and no images.
- **Prompt.** The system prompt is the server's; client context is data.

### 9.3 Approval integrity

- Bound to the approval record (`kind='assistant'`): user, tenant, action and the digest of the stored arguments. Single use, valid at most 300 s.
- Re-checked at resume: the cap, the base versions and the current policy. A newer deny or a moved base version stops it.
- Edited arguments are refused; an edit is a new proposal.

### 9.4 Conversation integrity

AG-UI sends the history from the client on every run, so a client could forge earlier assistant or tool messages.
- **v1:** the server signs the history it produced, with an HMAC over tenant, user, thread id and the canonical messages, carried in state. A run whose earlier turns do not verify is refused. No conversation content is stored on the server, which matches metadata-only capture.
- **Alternative:** server-held threads with a short TTL (decision 9).

### 9.5 Audit

| What | Record | Kept |
|---|---|---|
| a run | `assistant.run` | run and thread ids, user, model, tokens, outcome |
| a tool call | `assistant.tool` | tool name, argument digest, result size, duration |
| a proposal | `assistant.proposal.created` | item summary, digest, approval id |
| a decision | `assistant.proposal.approved`, `rejected` or `expired` | approver, change set id |
| the change set | its existing transition and promotion records | as today |
| a guardrail | `assistant.guardrail_checked` and `assistant.guardrail_denied` (both existing) | boundary, policy ids, digest |
| a model call | `InteractionLog`, through the governed transport | as `content_capture_mode` says |

Prompts and answers are not stored by default; digests and sizes are.

### 9.6 Limits

- One active run per thread. A pending interrupt blocks new turns until it is answered or cancelled.
- At most 6 tool iterations per run, today's `max_tool_iterations`.
- A per-user rate of runs and a token cap per run; the tenant's budgets apply through the governed transport.
- The session idle timeout from #448 (`SESSION_IDLE_TIMEOUT_SECONDS`, 1800 s by default) ends a dock session like any other.

## 10. Delivery

Sub-issues, in order:
1. The governed transport: the proxy's evaluate, filter and log steps in one service; the assistant's agent endpoint; canonical usage with a server request id; two-tenant tests.
2. The Bedrock Mantle upstream (SigV4, task role); registry prices for the Bedrock ids; the installer's IAM grant and settings; the shared-model and provider-key routes; the resolved route shown in Settings > Assistant.
3. The ASGI assistant process, and edge routing for compose, ECS (installer) and Kubernetes.
4. The Pydantic AI agent, the AG-UI endpoint, the read tools through the API layer, and the role-filtered tool list.
5. The proposal tools: interrupt and resume, approval binding, and the change set created as the user.
6. Onboarding: the questions, the mapper, the `TenantConfig` state, and `assistant/onboarding`.
7. The dock, in Storybook against recorded streams, then in the shell; the frontend tools on the navigation model and the `data-tour` anchors.
8. Guardrails on tool results, history signing, the audit records and the limits.
9. Removal of `/assistant`, `/policies/copilot`, `ChatBubble`, `use-chat`, `assistant/chat`, `execute-tool` and the copilot endpoints, one release after the dock ships.

Depends on: one config schema per policy type (audit PR 13, H20) for proposal validation, and the shell's dock slot (ui-overhaul-ia.md, migration step 2).

## 11. Decisions for Leo

1. **Framework:** Pydantic AI (recommended) or Strands.
2. **Governed path:** the in-process governed transport, sharing the proxy's code (recommended); the Go gateway, which needs a gateway on every install and a Bedrock upstream; or the Django proxy over HTTP (rejected).
3. **Bedrock:** default `anthropic.claude-sonnet-5-5`, falling back to `anthropic.claude-sonnet-5`; the global endpoint by default and the regional one for residency; the installer grants `bedrock-mantle:CreateInference` to the Zentinelle task role.
4. **Outside AWS:** the shared in-cluster model, then a tenant provider key, then off. No environment-key fallback.
5. **Process:** a separate ASGI service (recommended), or gthread workers as an interim.
6. **Write path:** every assistant write is a policy change set, staged by operators and promoted by admins (recommended); or parity with the policy editor, where an operator applies directly.
7. **v1 write scope:** policies only. Acknowledge, resolve, review, run and report leave the assistant.
8. **v1 cap:** audit mode and log or alert only; no enforce, block, `require_approval`, hard limits, disable or delete. Step-up is built before the cap lifts.
9. **History:** signed client history with no content stored (recommended), or server threads with a TTL.
10. **Text:** hold the final text until the output check passes, as today (recommended for v1), or stream tokens.
11. **Onboarding:** admin-led, with the answers stored in `TenantConfig` and the proposals from a deterministic mapper.
12. **Frontend:** `@ag-ui/client` and an in-house dock (recommended), or CopilotKit.
13. **Spend and entitlement:** the assistant's spend counts against the tenant's budgets and can be stopped by them; its agent endpoint does not count against the agent entitlement. Confirm.
14. **Default state:** on when a model route resolves, with an admin switch to turn it off; or off until an admin turns it on.
15. **Reuse:** the same pattern for the Astrolift console and Chat Studio later, copied into each product (recommended), not a shared package now.
