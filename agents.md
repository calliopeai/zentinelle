# agents.md — Zentinelle (Generic Agents)

> Read [bootstrap.md](bootstrap.md) for full technical context.
> Read [memory.md](memory.md) for project decisions and current state.

## Agent Notes

- This is a Django 5.0 + Next.js 14 project
- All work happens on `main` — no PRs needed for agent commits
- Run the pre-commit validation checklist in `bootstrap.md` before every backend commit
- GraphQL schema ordering rule is critical — see bootstrap.md
- `tenant_id` is always an opaque string — never create FKs to external models
- For Calliope-internal deployment details, see `calliope.md` (not committed to this repo)
