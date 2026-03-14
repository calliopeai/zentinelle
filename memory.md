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

### Knowledge System (applies to all Calliope repos)
Every repo uses this schema:
```
bootstrap.md      # canonical technical knowledge — agent-agnostic, public
memory.md         # this file — persistent decisions and state
CLAUDE.md         # Claude Code shim → bootstrap.md + memory.md
agents.md         # generic agents shim
gemini.md         # Gemini shim
calliope.md       # Calliope-internal shim (gitignored — internal wiring only)
docs/wiki/        # deep technical documentation
```
- Write knowledge once in bootstrap.md. Each AI gets a thin shim. No duplication.
- `calliope.md` always gitignored — internal auth wiring, env vars, internal URLs never in public repo
- Apply this pattern to every repo in the Calliope ecosystem

---

## Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1: Bootstrap | Repo scaffold, wiki, docs, MIT license, DB schema isolation | In progress |
| M2: Extraction | Code extracted from client-cove, standalone service running | Todo |
| M3: Decoupled | No client-cove Django model imports, auth callout working | Todo |
| M4: v0.1.0 OSS | Feature complete, public release | Todo |

## Open Issues

Project board: https://github.com/orgs/calliopeai/projects/4

| Issue | Title |
|-------|-------|
| [#1](https://github.com/calliopeai/zentinelle/issues/1) | Abstract Organization FK to tenant_id |
| [#2](https://github.com/calliopeai/zentinelle/issues/2) | Abstract User FK to user_id |
| [#3](https://github.com/calliopeai/zentinelle/issues/3) | Make Deployment FK optional |
| [#4](https://github.com/calliopeai/zentinelle/issues/4) | Create ZentinelleLicense and AgentEntitlement models |
| [#5](https://github.com/calliopeai/zentinelle/issues/5) | OSS strategy + MIT license |
| [#6](https://github.com/calliopeai/zentinelle/issues/6) | Repo bootstrap (M1) |
| [#7](https://github.com/calliopeai/zentinelle/issues/7) | DB schema isolation |
| [#8](https://github.com/calliopeai/zentinelle/issues/8) | Code extraction from client-cove |
| [#9](https://github.com/calliopeai/zentinelle/issues/9) | Auth bridge / TenantResolver |
| [#10](https://github.com/calliopeai/zentinelle/issues/10) | BYOC + forward deployed model |
| [#11](https://github.com/calliopeai/zentinelle/issues/11) | Product completion for v0.1 |
