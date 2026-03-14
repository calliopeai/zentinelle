# gemini.md — Zentinelle (Gemini)

> Read [bootstrap.md](bootstrap.md) for full technical context.
> Read [memory.md](memory.md) for project decisions and current state.

## Gemini-Specific Notes

- Python backend: Django 5.0, Graphene GraphQL, Celery, PostgreSQL, Redis
- TypeScript frontend: Next.js 14 App Router, Chakra UI, Apollo Client
- All models are scoped to `tenant_id` — never query without tenant filter
- See `bootstrap.md` for GraphQL schema ordering rule and pre-commit checklist
- For Calliope-internal deployment details, see `calliope.md` (not committed to this repo)
