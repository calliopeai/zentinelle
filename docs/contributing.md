
# Contributing

Zentinelle is MIT-licensed and we welcome contributions.

## Areas where help is needed

### High priority
- **Data pipeline** -- token counting, cost estimation, latency measurement from real agent activity ([#68](https://github.com/calliopeai/zentinelle/issues/68), [#70-#76](https://github.com/calliopeai/zentinelle/issues))
- **Dynamic model catalog** -- fetch model lists from providers instead of hardcoding ([#66](https://github.com/calliopeai/zentinelle/issues/66))
- **Integration tests** -- real end-to-end tests per agent SDK ([#77](https://github.com/calliopeai/zentinelle/issues/77))

### Medium priority
- **Accessibility** -- keyboard navigation, focus visibility, WCAG AA compliance ([#59-#65](https://github.com/calliopeai/zentinelle/issues))
- **Agent integrations** -- hooks/proxy for more coding agents
- **Knowledge graph** -- auto-update on commits, codebase navigation ([#67](https://github.com/calliopeai/zentinelle/issues/67))

### Always welcome
- Bug reports with reproduction steps
- Documentation improvements
- UI/UX feedback

## Development setup

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
docker compose up -d

# Backend (Django)
cd backend
pipenv install
pipenv run python manage.py migrate --database=zentinelle
pipenv run python manage.py migrate
pipenv run pytest

# Frontend (Next.js)
cd frontend
npm install
npm run dev
```

## Pre-commit checklist

Run before every backend commit:

```bash
cd backend

# 1. Django startup check
pipenv run python -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# 2. Migration check
pipenv run python manage.py makemigrations --check --dry-run

# 3. Tests
pipenv run pytest

# 4. Lint
pipenv run ruff check
```

## Git practices

- Commit directly to `main`
- No rebasing, no force-push
- No co-authorship messages
- Imperative mood commit messages

## Project structure

See [Knowledge Graph](knowledge-graph) for the full codebase map and data flows.

See [Tech Stack](tech-stack) for technology choices.

See [Methodology Primer](primer) for how we work.
