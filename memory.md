# memory.md — Zentinelle

Persistent project memory. Decisions, context, open questions. Updated as the project evolves.

---

## September 2026 enforcement remediation

The top-down BROCS review led to remediation tracked in #332. Prioritize dependable enforcement and evidence before expanding the catalogue. See `docs/dependable-controls.md` for deployment, migration and compatibility notes, and `docs/reviews/2026-09-10-remediation.md` for validation.

Key decisions: local authentication by default; gateway failures deny access; workload identity comes from the validated key; human management uses session roles and CSRF. OIDC identity is issuer/subject with role reconciliation. Independent policies compose unless explicitly grouped for replacement, and mandatory controls remain effective. Approval records bind exact actions and are consumed once. Hard budgets use conservative atomic admission charges; trusted provider reconciliation is future work. Metadata-only content capture is the default. Both cleanup jobs share hold-aware decisions; non-delete lifecycle actions preserve data for review. Audit v2 includes changes and actor context, with signed retention witnesses and complete export manifests. Compliance reports distinguish configuration from unverified operating evidence.

The separate production Compose profile uses HTTPS at Caddy and private service ports. Prepare independent schema migration ledgers before per-alias migrations. No production deployment or push is implied by local remediation work.

Follow-on work is filed as #333–#342 on Project 4: runtime coverage, unified agent operations, staged policy change, incident containment, BROCS evidence, trusted budget reconciliation, model/tool authority, durable telemetry, archival/privacy lifecycle, and release/recovery assurance.

The portal support assistant now performs deterministic product-scope and tenant organization-policy preflight before provider access. MITRE ATLAS threat mappings are documented in `docs/atlas-guardrails.md`; #343 tracks the threat/evidence model and #344 tracks the broader input/output guardrail and evaluation work.

The assistant slice is a first consumer of the broader functional policy guardrail model tracked in #345. That model must cover coding agents, workflow agents, model and retrieval boundaries, tool calls, workflow transitions, egress, and operator actions under one decision and evidence contract.

The existing policy hierarchy is organization → sub-organization (OU/team) → deployment (workflow/environment) → endpoint (agent) → user. Policy type is the control category, rather than another scope level. Functional resolution should compose distinct controls, permit replacement only through explicit `override_group`, and preserve `non_overridable` denies at narrower scopes.

Policy rollout now has a durable `PolicyChangeSet` and tenant-scoped API. Promotion checks captured base versions transactionally, records pre-promotion snapshots, requires administrator authority, and supports audited rollback with version advancement. Endpoint/gateway acknowledgement and replay-backed rollout evidence remain open in #335.

## Agent Host Protocol (#377)

An AHP host is one `agent_host` endpoint with one key; harness, session and chat travel in each `/evaluate` context instead of being registered. A host receives `ask` for a call blocked only by a missing human approval and holds it on an `ApprovalRequest` until an operator decides or it expires. The approval digest no longer binds the per-call `trace_id`, which had made every approval miss its retry through `/evaluate`. Contract: `docs/agent-host.md`. Parent epic: calliopeai/calliope-vscode#790; the host-side gate is calliope-vscode#794 and host telemetry is #378.

## Gateway provider keys (#380)

Decided 2026-09-22 (option A): the Go gateway injects the provider key the agent's tenant stored (`LLMProviderKey`), read through `POST /api/zentinelle/v1/gateway/provider-key` with the agent key plus the deployment-wide `ZENTINELLE_GATEWAY_TOKEN`, and cached 60s. It never forwards a client-supplied key. Env keys are a single-tenant fallback behind `ALLOW_ENV_PROVIDER_KEYS=true`, and the gateway refuses to start with no key source. A shared secret was chosen over an `sk_service_` key because service keys are tenant-bound and one gateway serves many tenants. The Django `/proxy/` path is to be deprecated once the company agents move to the gateway (calliopeai/astrolift-app#1851).

## Strategic Decisions

### Product + Business Model
- Zentinelle is a standalone AI Agent GRC platform, companion to Calliope AI — sold and deployed independently
- Different failure domain than Client Cove: thousands of agents vs management console
- Market optionality — unclear which business line will resonate, so keeping options open
- Brand/SEO value of separate identity (zentinelle.ai)
- **MIT licensed** — maximizes adoption, derisks legal friction for enterprise procurement
- Revenue: managed cloud hosting + BYOC + forward deployed ops. "Be infrastructure."
- The value is operational expertise and reliability, not the license
- Open source builds the trust that SOC2 PDFs can't — especially important for GRC/compliance tooling

### Architecture
- Extracted from `client-cove/backend/zentinelle/` into this repo (no live data — ideal time)
- Same PostgreSQL DB as Client Cove for now, isolated in `zentinelle` schema — splits cleanly later via `pg_dump --schema=zentinelle`
- Auth is pluggable via `TenantResolver` — standalone mode ships publicly; managed deployment wiring is internal only
- `tenant_id` is always an opaque string on every model — no external FKs ever
- `zentinelle-sdk.git` stays as its own repo (already separate)
- Next.js GRC portal (currently `client-cove/zentinelle/`, port 3002) moves here

### Coupling to Decouple (from client-cove)
1. `organization.Organization` → `tenant_id` string + TenantResolver callout
2. `billing.features` → entitlement API (managed deployment only)
3. `deployments.Deployment` → optional external reference by ID (nullable FK → string)
4. `core.models.internal_admin` → abstract admin checks

### Knowledge System (applies to all Calliope AI repos)
Every repo uses this schema:
```
bootstrap.md      # canonical technical knowledge — agent-agnostic, public
memory.md         # this file — persistent decisions and state
CLAUDE.md         # Claude Code shim → bootstrap.md + memory.md
agents.md         # generic agents shim
antigravity.md    # Antigravity CLI shim
calliope.md       # Calliope AI-internal shim (gitignored — internal wiring only)
docs/wiki/        # deep technical documentation
```
- Write knowledge once in bootstrap.md. Each AI gets a thin shim. No duplication.
- `calliope.md` always gitignored — internal auth wiring, env vars, internal URLs never in public repo
- Apply this pattern to every repo in the Calliope AI ecosystem

---

## Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1: Bootstrap | Repo scaffold, wiki, docs, MIT license, DB schema isolation | ✅ Done |
| M2: Extraction | Code extracted from client-cove, standalone service running | ✅ Done |
| M3: Decoupled | No client-cove Django model imports, auth callout working | ✅ Done (in client-cove) |
| M4: v0.1.0 OSS | Feature complete, standalone service | ✅ Done |
| M5: v1.0.0 | Production-ready: Strawberry GraphQL, new frontend, RBAC, OIDC, multi-cloud infra, security hardened | ✅ Done |

### M4 Progress (2026-03-16)

**Integration testing (#56) — completed:**
- Multi-agent gateway validated: Claude Code (hooks), Codex (proxy), Gemini (proxy)
- Agent types: `claude_code`, `gemini`, `codex`, `junohub`, `langchain`, `langgraph`, `mcp`, `chat`, `custom`
- LLM proxy wired: `/proxy/anthropic/`, `/proxy/openai/`, `/proxy/google/` with policy enforcement + CSRF exempt
- Nginx route added for `/proxy/`
- Policy cache invalidation fixed (versioned keys, immediate effect on CRUD)
- Rate limit evaluator confirmed working at 0 (blocks) and 120 (allows)
- Tool permission evaluator fixed (`context.tool` support)
- Events ingest → GraphQL query → monitoring dashboard pipeline validated
- Evaluate endpoint → InteractionLog → monitoring dashboard wired
- Proxy → InteractionLog → monitoring dashboard wired
- SDK renamed: `zentinelle-claude-code` → `zentinelle-agent` with `--provider` flag
- Test suite: `test_api_views.py` fixed (decoupled from Organization model)

**Bugs fixed:**
- Policy cache stale after GraphQL mutations (#56 open question)
- Proxy not routable (nginx missing `/proxy/` location)
- Proxy CSRF blocking on POST
- OpenAI proxy: needed `/v1` prefix in upstream URL
- OpenAI proxy: Host header included path prefix
- Proxy: reverse-proxy headers forwarded to upstream
- Tool permission evaluator: only checked `tool_name`, not `tool`
- Frontend: hardcoded 4 agent types, now 9

**Issues filed:**
- #57 Agent Groups: no way to add existing agents via UI (P1)
- #58 Dark mode: input text illegible on modals (P2)
- #59-#65 UX/UI accessibility review (keyboard a11y, focus visibility, hooks, aria labels, spacing, routes, timezone)
- #66 Dynamic model list from providers (P1)
- #67 Knowledge graph auto-update + codebase navigation (P2)

## Open Issues

Project board: https://github.com/orgs/calliopeai/projects/4
