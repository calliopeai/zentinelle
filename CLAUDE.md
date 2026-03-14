# CLAUDE.md — Zentinelle (Claude Code)

> Read [bootstrap.md](bootstrap.md) for full technical context.
> Read [memory.md](memory.md) for project decisions and current state.

## Claude-Specific Notes

- Pre-commit validation checklist is in `bootstrap.md` — run it before every backend commit
- GraphQL schema ordering rule is critical — forward references crash ECS startup silently
- No co-authorship messages in commits
- No rebasing
- Commit directly to `main`
- For managed/Calliope-internal deployment context, see `calliope.md` (not committed)
