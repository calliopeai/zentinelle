# Skill: Policy Engine Changes

Use this workflow when modifying policy evaluation logic, the policy engine, or anything that affects how policies are enforced.

## When to Use

- Modifying `services/policy_engine.py`
- Adding or changing a policy type
- Modifying `Policy` model fields or scope hierarchy
- Changing how `POST /api/evaluate` processes requests
- Changing content scanning or PII detection thresholds

## Impact Assessment (Run First)

Before making changes, assess blast radius using the table in `bootstrap.md`. For policy engine changes:

| Component Changed | d=1 Direct Impact | d=2 Indirect Impact | Risk |
|------------------|------------------|---------------------|------|
| `PolicyEngine.evaluate()` | Every `/api/evaluate` call, all agent enforcement | Rate limits, cost control, PII blocking, jailbreak detection | CRITICAL |
| `Policy.scope_type` / scope hierarchy | Policy resolution order | All multi-scope tenants | HIGH |
| Content scan thresholds | `ContentScan` results | Compliance reports, GDPR/HIPAA controls | HIGH |
| `fail_open` default | Agent behavior on Zentinelle outage | All connected agents | HIGH |
| Budget check (`check_budget()`) | Token budget enforcement | Cost metering, billing | MEDIUM |

**HALT condition:** If your change affects `PolicyEngine.evaluate()` at d=1, run the full test suite and manually verify the evaluate endpoint before committing.

## Workflow

### 1. Before Changing

- [ ] Read `docs/wiki/policies.md` for the policy type catalogue
- [ ] Identify which policy types are affected (use the impact table)
- [ ] If scope hierarchy changes: check all 5 scope levels (Org → Team → Deployment → Endpoint → User)

### 2. Making Changes

- [ ] Policy types MUST be enumerated/registered in the policy engine config registry
- [ ] New policy types MUST have: `evaluate()` implementation, test coverage, and entry in `docs/wiki/policies.md`
- [ ] `fail_open` behavior MUST be preserved as the default — never change this without explicit user approval
- [ ] Changes to `check_budget()` MUST still return `{'allowed': True/False, 'reason': str}`

### 3. Testing Policy Changes

```bash
cd backend

# Full test suite — policy tests are in zentinelle/tests/
pipenv run pytest zentinelle/tests/

# Specific policy tests
pipenv run pytest zentinelle/tests/test_policy_engine.py -v

# Test evaluate endpoint manually (if backend is running)
curl -X POST http://localhost:8000/api/zentinelle/evaluate \
  -H "Authorization: Bearer <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"action": "llm_call", "model": "gpt-4", "prompt": "test"}'
```

### 4. Validation Gate

**MUST pass before committing:**
- [ ] All existing policy tests pass
- [ ] Django startup check passes
- [ ] Manual evaluate endpoint test returns expected structure

**HALT if:** Any policy test that was previously passing now fails — do not commit.

### 5. Documentation

- [ ] If adding a new policy type: update `docs/wiki/policies.md`
- [ ] If changing evaluation behavior: update `bootstrap.md` impact table if blast radius changes
