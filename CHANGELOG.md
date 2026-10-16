# Changelog

Notable changes to Zentinelle. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `manage.py seed_integration_policies --tenant <id> --source <workbench|astrolift>`
  (installer#431). Creates one organization-wide agent_delegation,
  human_oversight and budget_limit policy in audit mode with the alert action
  and a soft budget (`hard_limit` false), so matches alert the tenant's owners
  and are never blocked, and switching a policy to enforce alerts rather than
  blocks until an operator changes its action. A type the
  tenant already has an organization-wide policy of is skipped, so a run never
  overwrites or doubles an operator's policy. The installer runs it once when
  Zentinelle is enabled with the Workbench or Astrolift.
- Astrolift per-task agent keys (#400). With its install credential,
  Astrolift mints a short-lived agent key for each agent task and box
  (`POST /api/zentinelle/v1/astrolift/agents`, `ttl_seconds` required), renews
  it while the workload runs (`POST .../agents/<agent_id>/renew`) and revokes
  it when it stops (`DELETE .../agents/<agent_id>`). Keys are minted in one of
  the install's tenants, only the install that minted an agent can renew or
  revoke it, and disconnecting the install terminates them all. A key never
  works longer than `ASTROLIFT_AGENT_KEY_MAX_LIFETIME_SECONDS` (default 7
  days) after its mint, an expired key is not renewed, and an agent that
  anyone but its install stopped (portal, kill switch, operator API,
  deregister) is not brought back by a mint (`409 agent_suspended`). The
  gateway releases the tenant's provider key to such a key like to any
  agent's, so no provider key has to enter the pod.
- Gateway: cluster heartbeats (#391). With `ZENTINELLE_CLUSTER_ID` and its
  credential set, the gateway reports to
  `POST /api/zentinelle/v1/astrolift/clusters/<id>/heartbeat` at start and then
  as often as Zentinelle asks (60 seconds today): a status judged from its own
  calls to Zentinelle since the last heartbeat, its version, and running totals
  of requests, blocked requests and distinct agents. Failures back off from 10
  seconds to five minutes, a refused credential is read again from its file,
  and a 404 is logged once and ends the heartbeats until the credential
  changes. `HEARTBEAT_INTERVAL_SECONDS` (default 60, `0` turns them off).
  Gateway images carry their version, from the `VERSION` build argument, and
  log it at startup.
- Astrolift installs and clusters (#389). An admin generates a one-time
  enrollment code (Settings > Astrolift, or `manage.py
  astrolift_enrollment_code`), and Astrolift exchanges it for an install
  credential through `POST /api/zentinelle/v1/astrolift/connect`. With that
  credential it registers each cluster and receives the cluster gateway's
  credential, scoped to the install's tenants or a subset of them. It can also
  rotate a credential with an overlap, revoke a cluster, or disconnect. Gateways
  report health, version and counters through
  `POST .../astrolift/clusters/<id>/heartbeat`. Every change is audited per
  tenant, without the code or any credential.
- Gateway credentials can expire (`expires_at`). A rotation through the
  Astrolift API uses this to let the earlier credential keep working for a
  while.
- Gateway: per-tenant provider keys (#380). The gateway injects the provider
  key the agent's tenant stored in Zentinelle (Settings > LLM providers), read
  through the new `POST /api/zentinelle/v1/gateway/provider-key` and cached for
  60 seconds. Each release of a key is audited with the gateway's name, without
  the value.
- Registered gateways: each gateway is a registration scoped to an explicit set
  of tenants, with its own credential (`sk_gateway_...`, stored as a bcrypt
  hash). A key is released only for a tenant in the gateway's scope, so one
  leaked cluster exposes only its own tenants; a gateway or a single credential
  is revoked on its own. Managed with `manage.py gateway_credential` (register,
  mint, scope, list, revoke).
- The gateway reads its credential from `ZENTINELLE_GATEWAY_CREDENTIAL`, or else
  the file at `ZENTINELLE_GATEWAY_CREDENTIAL_FILE` (default
  `/var/run/zentinelle/gateway-credential`), waits up to 60 seconds for the file
  at startup, and reads it again when the backend refuses it, so rotation needs
  no restart. The Kubernetes manifest mounts it from a Secret.
- Standalone compose needs no configuration: the backend registers a gateway
  named `local` for the install's tenant and writes its credential into a
  volume both containers mount.

### Changed

- The gateway never forwards a client-supplied provider key: `Authorization`,
  `x-api-key`, `x-goog-api-key` and Google's `key` query parameter are dropped
  on every request.
- **Breaking:** the gateway no longer uses its own env provider keys unless
  `ALLOW_ENV_PROVIDER_KEYS=true`, and refuses to start with no credential
  (variable or file) and no allowed env key. Compose installs keep working
  through the local gateway; any other deployment registers its gateway and
  gives it the credential.

### Deprecated

- `ALLOW_ENV_PROVIDER_KEYS`. Still honoured, with a warning at startup, and to
  be removed in a future release: store provider keys per tenant in Zentinelle
  instead.

### Fixed

- Model pricing matches exact model IDs only (audit C11). gpt-4 was priced as
  gpt-4o-mini, and current models (gpt-5, gpt-4.1, o3, Claude 4.5 and later,
  Gemini 2.5 and later) priced at $0, so every hard-budget request for them
  was refused. One resolver (`services/usage_tracking.resolve_model_pricing`)
  now prices admission, reconciliation, metering, alerts and the token
  calculator: the model registry first, then a catalog of the Anthropic,
  OpenAI and Gemini list prices published on 2026-10-16
  (`services/model_prices.py`, with long-prompt tiers and announced price
  changes). Migration 0066 fills the registry's missing prices and never
  replaces one an operator set; a model sync no longer clears or replaces a
  price. An unpriced model's cost is recorded as unknown, never as $0, and
  budgets name the unpriced calls they cannot count.
- Hard-budget reservations are reconciled with the call's metered cost
  (audit H5). The actual is recorded on the charge and only rises across
  repeat reports; a call that cost more than its reservation raises the
  commitment. Reported usage releases the rest of a reservation only on a
  budget with `reconcile_with_reported_usage: true`, since an agent can report
  its own usage; authenticated provider usage still releases it on any
  budget. Showback reads settlement from `reconciled_at`.
- Budgets follow their action (audit M14, H22). Admission reserves and refuses
  only for an enforced hard budget whose action, or one of its escalation
  steps, refuses (block, require_approval, redact), so an alert-action budget
  alerts instead. A soft
  budget (`hard_limit` false) now matches at `alert_threshold_percent` and
  when exceeded, so the seeded budget alerts; under enforce it is capped at
  alert and never refuses.
- Budget usage alerts read `budget_limit` policies (they filtered on
  `BUDGET_LIMIT`, which matches nothing), with `monthly_budget_usd`, the
  policy's scope and its threshold, the same way the evaluator does
  (audit M5).
- human_oversight prices a model call on the server (audit H19). A call that
  is not a model call has no model cost, so the seeded policy no longer
  matches every evaluation; a model call whose cost cannot be bounded (an
  unpriced model, or no explicit output limit) still matches as unknown
  cost, and a caller's `estimated_cost_usd` can raise the cost, never lower
  it.
- The gateway's usage reports were all refused (#406): it posts
  `/api/zentinelle/v1/events` with an empty `agent_id`, which the endpoint
  required, so no gateway traffic was ever metered. The key names its agent,
  so `agent_id` may now be left out or blank; a named one must still be the
  key's own.
- Two live agent keys whose stored prefix (`sk_agent_` and three characters)
  matched made every request with either key fail with a 500 on the evaluate,
  events, config, heartbeat, proxy and provider-key paths. Each candidate is
  now checked against its hash (#400).
