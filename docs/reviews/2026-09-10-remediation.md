# Enforcement remediation record

The [baseline review](2026-09-10-brocs-review.md) identified twelve findings. This implementation repairs the identified enforcement and evidence defects and records the remaining capability work as ten issues. Tracking: [#332](https://github.com/calliopeai/zentinelle/issues/332). See [deployment and compatibility notes](../dependable-controls.md) before upgrading.

## Corrections

| Finding | Implemented correction | Verification |
|---|---|---|
| F01: gateway identity/fallback | Derive workload identity from the validated key; reject mismatched asserted IDs. Every failed policy/authentication check denies access. Unsafe fail-open configuration is rejected. | Real gateway → Django → provider-stub allow, invalid-key and revoked-key cases; all error-status fallback fixtures. |
| F02: content contract | Normalize version 1 content fields and compatibility aliases; send complete request bodies and decoded output through evaluation. Required missing content fails enforcement. Buffer governed output and withhold it on inspection failure. | Late prompt injection, escaped PII, split SSE fragments and streamed tool arguments; real gateway/backend and Django-proxy regression tests. |
| F03: roles and object scope | Common portal role checks across REST and GraphQL; admin provider credentials, operator incident mutations; agent scan evidence restricted to its endpoint. Tenant-wide exports require human portal access. | Viewer/agent/direct-API negatives, authenticated actor attribution, same-tenant/different-endpoint evidence checks. |
| F04: sessions, browser writes and assistant | Session authentication for assistant; masked CSRF acquisition and browser fetch transport; server capabilities and UI guards; login throttles. Assistant mutation proposals issue durable actor/argument-bound tokens. Both GraphQL URL forms preserve POST bodies. | Real browser login, create policy, logout, missing-CSRF rejection and viewer denial; assistant argument substitution/replay tests. |
| F05: OIDC | Issuer/subject identities, explicit standalone tenant semantics, role reconciliation including unknown claims, disabled-user rejection, PKCE, required signed claims and key-cache refresh. | Signed JWT/JWKS rotation fixtures; real browser authorization-code flow with a local test IdP, including admin → operator → viewer demotion of one identity. |
| F06: audit integrity | Version 2 canonical hashes cover diffs and actor context. Verify sequence gaps, chain links, terminal heads and external checkpoints; preserve legacy coverage distinctions. Signed retention witnesses and complete export manifests support verification after download. | Tampered diffs/context, missing/reordered/tail-deleted records, legacy hashes, retention transitions, pinned checkpoints and truncated/reordered evidence bundles. |
| F07: capture and retention | Shared hold-aware cleanup; metadata/redacted/full capture before durable writes; preserve non-delete lifecycle requests. Remove autonomous ClickHouse TTLs and use tenant-scoped synchronous retention. | Both scheduled entry points, minimums, hold/release and capture fixtures; live PostgreSQL plus ClickHouse 25.8 test covering all four analytics tables and SQL events. |
| F08: human approval | Independent approval conditions; records bound to tenant, workload, user, action, argument digest, policy versions and short expiry. Atomic single-use admission; old unbound tokens rejected. | Missing identity, changed arguments, policy versions, expiry, replay and concurrent execution fixtures. |
| F09: composition and replay | Independent rules compose. Explicit override groups implement specificity/priority; mandatory rules remain. Stored workload team membership selects team policies. Replay reads the recorded action/context and counts missing/failed evaluation as inconclusive. | Scope/priority/composition tests and replay of a denied historical tool action. |
| F10: budget enforcement | One accepted monthly limit definition and server-side scoped spend; atomic conservative admission charges with request deduplication. Unsupported pricing/content bounds deny hard-budget admission. | Tenant/team/endpoint accounting, forged caller spend, duplicate requests and concurrent admission tests. |
| F11: coverage truthfulness | Check type, configuration, scope, enabled state and enforcement. Report configured controls with operating evidence unverified. | Coverage/report regression checks; no configuration-only claim of operating effectiveness. |
| F12: deployment | Remove synthetic Session-header authentication. Separate production Compose profile with production settings, strong required secrets, secure cookies, HTTPS edge and private services. Prepare independent schema migration ledgers. | Production Compose assertions, production Django startup, Caddy configuration validation and actual per-schema migrations. |

The required lint pass also exposed existing undefined names and import/formatting debt. Corrected those paths and normalized backend imports/whitespace. Backend lint now runs in CI. Long embedded SQL/templates/comments are exempt from a fixed line-length rule; correctness and other lint checks remain enabled. Explicit mutation exports preserve import checking without relying on formatter-sensitive suppression comments.

## Validation and its limits

Validation uses disposable local databases and provider/identity-provider fixtures. No customer data, paid model calls, deployed identity provider, or production traffic is involved.

- Backend startup and migration-drift checks; **705 tests passed, 62 existing skips**, plus 12 passing subtests; flake8 and isort passed.
- Frontend production build passed. Headless Chromium passed local login/policy creation/logout, CSRF rejection, viewer UI/API rejection and OIDC role demotion with an HttpOnly CSRF cookie.
- Go vet and race-enabled tests passed, including six real Django gateway contract cases.
- Production Compose assertions, production settings startup and Caddy configuration validation passed.
- Actual PostgreSQL schema migrations and PostgreSQL/ClickHouse hold-release-expiry checks passed.

The full suite contains 62 existing managed-integration skips. They are not evidence that those managed-only services work. The browser IdP is a test fixture, not certification against every enterprise provider. Configuration/startup checks are not a production deployment, load qualification or disaster-recovery exercise.

The gateway integration fixture is under `tests/integration/seed_gateway_contract.py` and runs in CI against real per-schema migrations. Run `gateway/backend_contract_test.go` with `CONTRACT_BACKEND_URL` and `CONTRACT_KEYS_FILE` for the opt-in integration test. `tests/integration/verify_retention_contract.py` verifies an empty, disposable ClickHouse database and migrated PostgreSQL deployment; it requires `ZENTINELLE_CONTRACT_TEST=1`. Historical probe files remain an archive of the baseline, not the corrected system's tests.

## Deliberate operating limits and filed improvements

Hard-budget charges conservatively retain their admitted upper bounds. Trusted provider reconciliation/refunds and versioned pricing are [#338](https://github.com/calliopeai/zentinelle/issues/338). Non-delete retention requests preserve data for review; a complete archival/privacy lifecycle is [#341](https://github.com/calliopeai/zentinelle/issues/341). Protect audit signing keys and retain checkpoints outside the application database; automated operating-evidence workflows are [#337](https://github.com/calliopeai/zentinelle/issues/337). These limits are documented, not silently treated as completed product capabilities.

| Issue | Improvement | Priority |
|---|---|---|
| [#333](https://github.com/calliopeai/zentinelle/issues/333) | Verified onboarding, runtime enforcement coverage and integration conformance | P1 |
| [#334](https://github.com/calliopeai/zentinelle/issues/334) | Unified agent ownership, authority, health and stop controls | P2 |
| [#335](https://github.com/calliopeai/zentinelle/issues/335) | Reviewed policy staging, replay, acknowledgement and rollback | P1 |
| [#336](https://github.com/calliopeai/zentinelle/issues/336) | Incident investigation, containment and evidence export | P1 |
| [#337](https://github.com/calliopeai/zentinelle/issues/337) | Evidence-backed BROCS/control coverage | P2 |
| [#338](https://github.com/calliopeai/zentinelle/issues/338) | Trusted budget reconciliation and cost governance | P1 |
| [#339](https://github.com/calliopeai/zentinelle/issues/339) | Model-route assurance and scoped delegated tools/retrieval | P2 |
| [#340](https://github.com/calliopeai/zentinelle/issues/340) | Durable bounded telemetry and delivery health | P1 |
| [#341](https://github.com/calliopeai/zentinelle/issues/341) | Hold-aware archival and privacy lifecycle operations | P1 |
| [#342](https://github.com/calliopeai/zentinelle/issues/342) | Production release, load, recovery and security qualification | P1 |

All ten issues have acceptance criteria, depend on validation of #332, and are in **Todo** on [Project 4](https://github.com/orgs/calliopeai/projects/4). This work does not assign a BROCS maturity score or assert compliance certification.
