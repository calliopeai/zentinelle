# Contributing to Zentinelle

Thanks for your interest. Zentinelle is MIT licensed and welcomes contributions.

## Development Setup

See [docs/wiki/development.md](docs/wiki/development.md) for full setup instructions.

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env
docker compose up
```

## How to Contribute

1. **Open an issue first** for non-trivial changes — alignment before code saves everyone time.
2. Fork the repo and create a branch from `main`.
3. Make your changes with tests.
4. Open a PR against `main`.

## What We Welcome

- Bug fixes
- SDK framework plugins (LangChain, LlamaIndex, etc.)
- New policy types
- LLM provider integrations
- Documentation improvements
- Compliance framework mappings

## Code Standards

### Backend (Python)
- PEP-8, enforced via `flake8` pre-commit hook
- `isort` for import ordering
- Type hints on all new functions
- Tests for new features (`pytest`)

### Frontend (TypeScript)
- ESLint + Prettier
- GraphQL types auto-generated — run `npm run compile` after schema changes
- No `any` types

### Commits
- Short imperative subject line (`add rate limit policy type`, not `Added rate limit policy type`)
- No co-authorship trailers

## Architecture Decisions

Key decisions are documented as GitHub Issues tagged `architecture`. Read them before making structural changes:
- [#5 OSS strategy](https://github.com/calliopeai/zentinelle/issues/5)
- [#7 DB schema isolation](https://github.com/calliopeai/zentinelle/issues/7)
- [#9 Auth bridge](https://github.com/calliopeai/zentinelle/issues/9)

## Questions

Open a GitHub Discussion or Issue.
