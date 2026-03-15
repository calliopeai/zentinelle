# Skill: Backend Changes

Use this workflow for any Python/Django change to the Zentinelle backend.

## When to Use

- Adding or modifying Django models
- Adding or modifying GraphQL types, queries, or mutations
- Adding or modifying REST API views or serializers
- Adding or modifying services, tasks, or auth logic
- Any change under `backend/zentinelle/`

## Workflow

### 1. Before You Start

- [ ] Read `bootstrap.md` for architecture context
- [ ] Read `memory.md` for current project state
- [ ] If working on a GitHub issue: move it to **In Progress**

### 2. Make Your Changes

- [ ] Models: add `tenant_id` to any new model — MUST NOT omit it
- [ ] Models: if adding fields, create a migration (`makemigrations`)
- [ ] GraphQL: follow type ordering rule — types before queries before mutations
- [ ] GraphQL: add resolvers for every new field — no implicit serialization of Decimal/JSONField
- [ ] Services: all DB queries MUST filter by `tenant_id`
- [ ] MUST NOT add FK to any external model (Organization, User, Deployment, etc.)

### 3. Pre-Commit Validation

Run in order. **HALT on any failure — do not continue to next step.**

```bash
cd backend

# Step 1 — Django startup (CRITICAL: schema ordering violations crash here)
pipenv run python -c \
  "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# Step 2 — Migration check
pipenv run python manage.py makemigrations --check --dry-run

# Step 3 — Tests
pipenv run pytest

# Step 4 — Lint
pipenv run flake8
pipenv run isort --check-only .
```

**Halt conditions:**
- Step 1 fails → STOP. Do not commit. Fix the import/ordering error first.
  - Common cause: GraphQL type defined after the Query/Mutation that references it.
  - Common cause: Circular import — move import inside the function body.
- Step 2 fails → STOP. Run `makemigrations` and include the migration in your commit.
- Step 3 fails on existing tests → investigate. Do not commit broken tests.

### 4. Commit

- [ ] Commit message describes the *why*, not just the *what*
- [ ] MUST NOT include co-authorship or AI attribution lines
- [ ] MUST NOT rebase or amend published commits

### 5. Close the Loop

- [ ] If working on a GitHub issue: close it with `gh issue close <number> --repo calliopeai/zentinelle`
- [ ] If it was a significant change: update `memory.md` if any architectural decision was made

## Impact Reference

Before making a change, check the impact table in `bootstrap.md` to understand what downstream components you might affect.
