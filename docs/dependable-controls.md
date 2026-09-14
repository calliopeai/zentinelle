# Dependable control deployment and upgrade notes

This change addresses the enforcement findings from the [September review](reviews/2026-09-10-brocs-review.md). The [remediation issue](https://github.com/calliopeai/zentinelle/issues/332) tracks validation; improvement issues #333–#342 track the next capabilities.

## Deployment and authentication

Use `docker compose -f compose.production.yaml up -d --build` with a public `ZENTINELLE_DOMAIN`, strong `SECRET_KEY`, `POSTGRES_PASSWORD`, `ZENTINELLE_BOOTSTRAP_SECRET`, and a Fernet `ZENTINELLE_SECRET_KEY`. Caddy provides HTTPS. Set `AUTH_MODE=local` or `sso`; production rejects open mode. Create the first administrator with `docker compose -f compose.production.yaml exec backend python manage.py createsuperuser`.

The regular `docker-compose.yml` is a development profile. Open mode must be explicit and grants administrative authority. Arbitrary `Authorization: Session ...` headers never establish a session. Portal writes require a session, the appropriate role, and a CSRF token obtained from `/api/zentinelle/v1/auth/csrf`. Viewer roles read; operators change operational resources; administrators manage credentials, installation settings and legal holds. Agent keys do not grant portal management or tenant-wide export access. Agent scan evidence is endpoint-scoped.

OIDC identities use issuer plus subject, with email retained as profile data. Existing email-based accounts are not silently linked. Missing/unknown roles become viewer on the next login. Use `OIDC_EXPECTED_TENANT` to constrain tenant-bearing identities. Standalone sessions belong to the installation's one tenant; this is not a shared multi-tenant console. Authorization-code login uses PKCE and expiring, single-use state/nonce. The signing-key cache refreshes on an unknown key ID.

## Database upgrade

Back up and test restoration before upgrading. Run `python manage.py prepare_schemas` before migrations on `default`, `zentinelle`, and `analytics`, in that order. Compose performs these steps. Each schema needs its own migration ledger: otherwise PostgreSQL's fallback search path can cause Django to skip analytics migrations. The preparation command refuses to adopt existing tables without a ledger; reconcile that installation's migration history explicitly before continuing.

Migrations 0037–0039 add approval and budget records, policy composition fields, and versioned audit retention witnesses. Historical hashes remain version 1; their narrower field coverage cannot be repaired retrospectively. New entries use version 2.

After each production rollout, run the **Post-deploy persistence smoke** workflow
from GitHub Actions. Provide the deployment role, ECS cluster and backend service,
and the tenant identifier used by the deployment check. The workflow uses ECS Exec
to run `python manage.py persistence_smoke --tenant-id <tenant> --json` in the
running backend and fails unless the routed tables, migration ledger and
tenant-scoped queries all pass. Grant the workflow role only `ecs:ListTasks`,
`ecs:DescribeTasks`, and the ECS Exec SSM channel permissions required by your
organization's standard execution role.

## Evaluation, approvals and budgets

The version 1 evaluation envelope contains an action, an optional asserted agent ID, an optional user ID, and a context object. `context.schema_version` may be omitted for existing clients; unsupported explicit versions are rejected. The authenticated key determines the workload and tenant. Canonical content fields are `input_text`, `output_text`, `tool_outputs`, `rag_context`, and complete JSON `request_body`. Known older aliases normalize at the boundary. Enforcement requiring missing inspection content denies or reports an inconclusive replay. Both proxies inspect complete buffered output, including decoded JSON/SSE and tool arguments, before release when output filtering applies. Streaming then loses incremental delivery by design.

Every independent policy composes by default. To request inheritance replacement, set the same nonempty `override_group` on policies of the same type. More-specific scope wins within that group, then priority; `non_overridable` controls always compose. A workload's stored team membership supplies team scope. Existing deployments that intentionally relied on one-policy-per-type replacement must review their effective policy sets before rollout.

Human approvals are issued by an operator through `POST /api/zentinelle/v1/approvals`; they bind tenant, workload, user, action, exact normalized context, current policy versions and a maximum five-minute expiry. Execution consumes them once, atomically. Old unbound tool tokens are rejected. Assistant mutations likewise require a server-issued proposal token bound to the actor and exact arguments.

Hard monthly budgets accept `monthly_budget_usd` and the older `monthly_limit_usd`; conflicting settings are rejected. Admission charges are serialized and deduplicated by tenant, endpoint and request ID. Use an explicit positive output-token bound and a priced text model. Unknown pricing, multimodal, multiple candidates and provider-hosted tools cannot receive a hard-budget admission. Charges conservatively commit the upper bound until month end; agent telemetry cannot refund them. Trusted provider reconciliation, broader pricing coverage and refunds are tracked in [#338](https://github.com/calliopeai/zentinelle/issues/338). These controls govern requests that traverse the enforcement integration; deployment coverage and direct-provider bypass checks are tracked in [#333](https://github.com/calliopeai/zentinelle/issues/333).

## Capture, retention and evidence

`CONTENT_CAPTURE_MODE=metadata` is the default: known prompt/response fields are excluded from durable event, interaction, scan and analytics payloads. `redacted` retains inspected content after pattern-based PII/secret redaction; `full` retains content explicitly. Pattern redaction is not a guarantee of removing every sensitive value. Gateway `LOG_INTERACTIONS` defaults to false. Content required for enforcement is inspected in memory before capture rules apply.

Both scheduled cleanup entry points share the retention service. Active effective legal holds conservatively preserve the whole tenant. Required retention periods are combined conservatively. Archive, anonymize and flag actions preserve data for review until an operational implementation is available in [#341](https://github.com/calliopeai/zentinelle/issues/341); they never silently become deletion. Audit identities are not anonymized in place because that would invalidate hashes.

If ClickHouse is configured, remove legacy table TTLs before relying on legal holds. `disable_automatic_retention()` runs before cleanup and before saving an active hold and fails if the configured store cannot be reached. New schema definitions have no autonomous TTL. Existing deletions already performed by TTL cannot be recovered by this change. Cleanup uses the shared hold decision and synchronous tenant-scoped mutations across the analytics tables.

Audit retention removes only an expired contiguous prefix, leaving a signed boundary and compact witnesses. Verification checks sequence gaps, entry content, chain links and terminal state. Retain signed checkpoints outside the application database and protect `AUDIT_CHECKPOINT_SIGNING_KEY` (defaults to `SECRET_KEY`) separately to detect rollback beyond the database's own trust boundary. These signatures do not protect against an attacker controlling both data and the signing key.

Use `/api/zentinelle/v1/audit/export/?from=...&to=...&format=bundle` for a lossless NDJSON export with a final signed manifest. `verify_evidence_bundle(lines, tenant_id)` verifies count, byte digest, tenant and entry hashes without querying the database. The final manifest is required; interrupted, reordered or truncated downloads fail. Keep its selection and checkpoint with the evidence. Plain NDJSON remains lossless; CSV and CEF are convenience formats rather than complete cryptographic evidence.

Compliance reports label matching enforcement as **configured**, with operating evidence **unverified**. Name, type, enabled state, scope, enforcement and expected configuration are checked. A configuration inventory does not establish BROCS maturity or compliance certification. Dated operating evidence and stable control ownership are tracked in [#337](https://github.com/calliopeai/zentinelle/issues/337).
