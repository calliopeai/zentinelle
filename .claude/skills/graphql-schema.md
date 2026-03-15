# Skill: GraphQL Schema Changes

Use this workflow for any change to the GraphQL schema — types, queries, or mutations.

## When to Use

- Adding a new ObjectType, InputType, or Connection type
- Adding a query resolver to `schema/queries.py`
- Adding a mutation to `schema/mutations/*.py`
- Wiring a stub resolver to real data
- Adding new fields to existing types

## Critical Rule: Type Ordering

Django evaluates class bodies at import time. Any forward reference crashes startup silently.

**MUST define in this order within every file:**
1. Imports
2. Enums and InputTypes
3. ObjectTypes (leaf types first, then types that reference them)
4. Result/Connection types (`*Result`, `*Connection`)
5. Query class
6. Mutation class

**NEVER reference a type before it is defined.**

## Workflow

### 1. Adding a New Type

- [ ] Define the ObjectType **above** any Query/Mutation that references it
- [ ] For `DecimalField` → use `graphene.Float()` with an explicit `resolve_*` that calls `float()`
- [ ] For `JSONField` (list) → use `graphene.List(graphene.String)` with a resolver that handles both list and JSON-string cases
- [ ] For `JSONField` (dict) → use `graphene.JSONString()` or define a typed ObjectType
- [ ] Add the type to the imports in `schema/types.py` or the relevant mutations file

### 2. Adding a Query Resolver

- [ ] Add the field to the Query class with the correct return type
- [ ] Add `resolve_<field>` static method
- [ ] MUST filter queryset by `tenant_id` from `get_request_tenant_id(info.context.user)`
- [ ] If the resolver uses a model import inside the function body, place it at the **top** of the function before any reference to it

### 3. Adding a Mutation

- [ ] Define `Arguments` inner class
- [ ] Define `Output` type (MUST be defined before this mutation class)
- [ ] Implement `mutate(root, info, ...)` as a `@staticmethod`
- [ ] Validate auth: check `info.context.user.is_authenticated`
- [ ] Get tenant: `get_request_tenant_id(info.context.user)`
- [ ] Add field to `Mutation` class in `schema/mutations/__init__.py`

### 4. Wiring a Stub Resolver

When turning a stub (returns `None` or `[]`) into a real resolver:

- [ ] Identify the model the data lives in
- [ ] Check the model has `tenant_id` filtering
- [ ] Replace `return None` / `return []` with actual queryset
- [ ] Remove the stub comment
- [ ] Update `schema/types.py` if new types are needed

### 5. Validation

```bash
cd backend

# MUST pass before committing — catches all ordering violations
pipenv run python -c \
  "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings'); django.setup()"

# Regenerate TypeScript types (frontend must be re-compiled after schema changes)
# Run from frontend/ with backend running:
# npm run compile
```

**Halt condition:** If Django startup fails, the schema has an ordering error. Find the forward reference and move the type definition above the class that uses it.

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Type defined after Query that uses it | `NameError` at startup | Move type class definition above Query |
| `DecimalField` serialized as string | `toFixed is not a function` in frontend | Add `graphene.Float()` field + `float()` resolver |
| `JSONField` (list) returned as string | `.map is not a function` in frontend | Add `graphene.List(graphene.String)` + parse resolver |
| Import inside resolver before import statement | `UnboundLocalError` | Move import to top of function body |
| Missing `tenant_id` filter | Cross-tenant data leak | Always filter: `.filter(tenant_id=tenant_id)` |
