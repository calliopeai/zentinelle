# memory.md — Zentinelle

Persistent project memory. Decisions, context, open questions. Updated as the project evolves.

---

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
gemini.md         # Gemini shim
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
| M4: v0.1.0 OSS | Feature complete, public release | In Progress |

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
