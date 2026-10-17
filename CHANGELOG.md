# Changelog

Notable changes to Zentinelle. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Agents and usage by Astrolift cluster (#389). `POST /astrolift/agents`
  takes an optional `cluster_id`, one of the install's live clusters whose
  gateway serves the agent's tenant, and the agent records it. A usage event
  `/events` receives with a gateway credential records that gateway's
  Astrolift cluster, never one from the payload. The `endpoints`, `events`
  and `usageMetrics` queries take `astroliftClusterId`, within the caller's
  tenant. `POST settings/astrolift/clusters/<id>/rotate` `{"overlap_seconds"}`
  lets a portal admin rotate a cluster's gateway credential next to revoking
  it, audited per tenant; the new credential is shown once and has to be put
  into the cluster's Secret before the overlap ends. Migration 0073 is on the
  `zentinelle` schema.

- Rules on tool arguments (#384). A tool_permission policy's `tool_configs`,
  keyed by the tool's name as the harness sends it (Claude's `Bash`, `Read`,
  `Write`, `Edit`; Codex's `shell`, `apply_patch`; Calliope AI's `shell`,
  `read_file`, `write_file`), takes `blocked_commands` and `allowed_commands`
  (glob patterns over each simple command, including the scripts of
  `sh -c` and `eval`) and `allowed_paths` and `blocked_paths` (path prefixes
  after `.` and `..` are resolved, relative paths against the call's working
  directory). They read `context.tool_input` and `context.tool_args`; a call
  carrying both must pass with each. A call its arguments refuse is denied
  before any approval hold. A command that cannot be parsed, a call with no
  command or path to check, and a relative path with no working directory
  are refused. Blocked patterns match text, so use allowed patterns as the
  boundary.
- Policy actions everywhere (#409). `policy_export` writes `spec.action`,
  `spec.block_level`, `spec.steer_message` and `spec.escalation`, and
  `policy_apply`, `policy_validate` and `policy_diff` read and check them; a
  file that names none leaves an existing policy's action as it is. Copilot
  drafts, diffs and staged drafts, the assistant's `create_policy`,
  `update_policy`, `get_policy_details` and `list_policies` tools, and
  `activate_pack` (with `activate_compliance_pack --action` and
  `--block-level`) carry the four fields, validated together with the stored
  ones, and `/register` and `/config` hand them to agents with each policy.

- Portal approvals inbox (#382). Governance > Approvals (`/approvals`) lists
  the tenant's held agent actions, newest first, with their agent, user,
  harness, session, policy reason and time left, and refreshes every 15
  seconds. Viewers read it; operators and administrators approve or deny with
  an optional reason, through their session and CSRF token. Arguments a
  metadata-only capture dropped are named as missing, never reconstructed,
  and the workload's approval token is never requested or shown.
- Gateway: control plane passthrough (#445). With `ASTROLIFT_CONTROL_PLANE_URL`
  set, `POST /api/dispatch/v1/agents/<task id>/callback/` (an agent's state
  heartbeat and event stream) and `POST /api/clusters/v1/<cluster id>/heartbeat/`
  and `POST /api/clusters/v1/<cluster id>/model-test-result/` (the keep-alive
  agent, which derives the second from its `HEARTBEAT_URL`) go straight to the Astrolift control plane, skipping
  the policy check, provider-key lookup and metering, so a degraded Zentinelle
  does not make a live agent look like an outage. Only those routes, only
  `POST` with a bearer key the control plane authenticates, and only
  `Authorization` and `Content-Type` are sent on.
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

- **Breaking:** `/scan`'s `allowed` follows the decided action, as
  `/evaluate`'s does (#408). Content decided as `require_approval` or
  `redact` is now refused (`allowed: false`); before, a `require_approval`
  rule was allowed, and so was a `redact` rule, with the text in
  `redacted_content`. A caller that declares `supports_redact` in
  `target_capabilities` is still allowed on a `redact` decision and passes on
  `enforcement.redacted_content` instead of the original. `supports_approval`
  changes nothing: a scan holds no call, so a target that can hold one does
  so from `enforcement`. The legacy `action` field is unchanged. Callers that
  read only `allowed` see existing redact and require_approval content rules
  start refusing; review them before upgrading.
- `ContentRule.enforcement` is out of the model (#416). Nothing reads it and
  saving no longer writes it from `action`. Migration 0074, on the
  `zentinelle` schema, keeps the column with a database default, because
  1.4.0 still selects it on every content-rule read during a rolling deploy
  or after a rollback; a later release drops it. The GraphQL `enforcement`
  field and input on content rules are unchanged (derived from and mapped to
  `action`).
- Reports and coverage honour a policy's action (#413). In the control
  coverage report, an enforced policy whose action and escalation only log
  or alert now reads `audit-only`, and one that only warns or steers reads
  the new `not-enforced`; both were `configured`. `/evaluate` coverage counts
  such a policy as `observation_only`. Change sets list `weakening_changes`:
  a change after which a policy can no longer refuse a call, or a new
  enforced policy that never can. The policy simulator and the support
  assistant's guardrails decide with the action too, and the simulator
  replays repeat escalation per endpoint.
- Escalation counts each match once (#413). The scan `/evaluate` runs on the
  content it logs counts no repeats and raises no alerts; `/scan` does. A
  call an approval releases does not count, and a call a host holds for an
  approval counts only if the approval is denied. Behind an agent host key,
  repeats count per session.
- Every boundary deny carries `enforcement`, and a dry run marks it
  `dry_run: true` (#413).

- Backend dependencies: graphene-django is removed. Nothing used it beyond
  `INSTALLED_APPS`; its graphql-relay pinned graphql-core below 3.3, which
  held strawberry-graphql at 0.327.7. The relay global-ID helpers the schema
  used now live in `zentinelle/schema/global_id.py` with the same encoding, so
  IDs the portal holds still decode. strawberry-graphql is 0.335.0,
  strawberry-graphql-django 0.93.0 and graphql-core 3.3.0.
- Cluster heartbeats count every gateway replica (#398). The gateway sends
  its host name (the pod name) as `instance`; Zentinelle keeps each replica's
  latest totals, shows the cluster their sum and the worst replica's health,
  and drops a replica silent for five minutes. Before, the latest beat won, so
  with two or more replicas the counters were one replica's.
- CI fails a change where `backend/requirements.txt`, which the image
  installs, pins differently from `Pipfile.lock`, which CI installs (#414).

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

- An approval issued with `POST /approvals` now matches the agent's
  `/evaluate` retry (#383). `/evaluate` adds `resource_type` and
  `resource_id` to the context before it is digested and the issuing view did
  not, so the retry was denied. Both now fill them in through one function,
  and the issued approval uses the canonical action name.
- Captured evidence keeps the UUIDs it names (#404). The passport and
  drivers_license patterns matched a UUID's first segment about 2% of the
  time, so a stored policy, endpoint or approval id could stop resolving. PII
  patterns now skip standalone UUIDs; secret patterns still scan everything.
- A prompt created or forked in the portal is saved in the caller's tenant
  (#454). Both saved it with no tenant, so it was missing from the list, null
  by id, and "Prompt not found" to the builder's save. The tenant is the
  caller's, never one a request names. A slug only has to be free in that
  tenant, and a prompt can be forked more than once (the second fork failed on
  the unique constraint). Migration 0070 moves the prompts already saved that
  way into their creator's tenant, the portal's. The prompts of a creator who
  also has prompts in another tenant stay unassigned, a slug the tenant already
  uses gets a suffix, and the seeded public library, which has no creator, is
  untouched. Another tenant's prompt, or one with no tenant, can be forked,
  rated, favourited, updated or deleted only once it is published (public and
  active), the rule the list and detail queries already applied, and
  `myPrompts`, `myFavorites`, `promptCount` and `parentPrompt` follow the same
  rule. The unwired create and fork in `schema/mutations/prompts.py` are
  removed, and so is the policy-document service's prompt creation, which
  could not run.
- A portal approval decision is saved only with its audit record. The
  decision and the audit log are written through different database
  connections, and the decision committed first, so a failed audit write left
  an approval or denial standing unrecorded. The decision's transaction now
  encloses the audit write and rolls back with it, as the Astrolift decision
  path already did.
- Model pricing matches exact model IDs only (audit C11). gpt-4 was priced as
  gpt-4o-mini, and current models (gpt-5, gpt-4.1, o3, Claude 4.5 and later,
  Gemini 2.5 and later) priced at $0, so every hard-budget request for them
  was refused. One resolver (`services/usage_tracking.resolve_model_pricing`)
  now prices admission, reconciliation, metering, alerts and the token
  calculator: the model registry first, then a catalog of the Anthropic,
  OpenAI and Gemini list prices published on 2026-10-16
  (`services/model_prices.py`, with long-prompt tiers and announced price
  changes). Migration 0069 fills the registry's missing prices and never
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
- The agents list links each row to its agent's page (#446).
- Edit in the prompt library edits the prompt (#446). The builder loads the
  prompt named by `?id=` and saves it as an update, where it used to start a
  new prompt.
- Compliance framework pages (#446). The detail page no longer shows a fixed
  list of controls marked met, which nothing computed; it says control
  coverage is not computed yet. The Compliance cards link only to frameworks
  with a detail page, which SOC 2 Type II and NIST AI RMF now reach, so none
  opens "Framework not found".
- Dead links in the console (#446). The governance page's Audit card opens
  the audit log; the notification bell opens an incident on the incidents
  list (`/incidents?incident=<id>`) and a budget warning on budget showback;
  breadcrumb sections that are not pages show as text.

### Security

- Astrolift agent key renewals are audited (#412). A renewal that moves a
  key's expiry more than a day past the expiry its tenant's audit chain last
  recorded (at the mint or the last audited renewal) writes
  `astrolift.agent_key.renewed`, with the new and previously recorded expiry
  and the number of renewals since, so a key is never live more than a day
  past what the chain shows. A box renewing twice an hour writes about one
  record a day. Migration 0071 adds the recorded expiry and the count; a key
  minted before it is audited on its first renewal.
- Usage reports name their source on the server (#412). An `llm:usage`,
  `ai_request`, `model_usage` or `model_request` event's `source` is
  `gateway` only when the report carries a gateway credential registered for
  the agent's tenant, and `agent` otherwise, whatever the payload said, so a
  pod holding its own agent key can no longer pass its usage off as the
  gateway's. The gateway now sends its credential
  (`X-Zentinelle-Gateway-Credential`) with each usage report. A credential
  that is unknown, revoked or out of scope is logged and the usage is still
  metered, as the agent's. Event IDs, request IDs and the raise-only repeat
  rule are unchanged.
- **Breaking:** the backend, ASGI and Temporal worker processes refuse to
  start while `SECRET_KEY`, `AUDIT_CHECKPOINT_SIGNING_KEY` (which inherits
  `SECRET_KEY`) or `ZENTINELLE_BOOTSTRAP_SECRET` is empty, a placeholder this
  repository has shipped, or shorter than 32 characters, or while
  `ZENTINELLE_SECRET_KEY` is not a Fernet key (audit T7). Compose and
  `.env.example` ship no secret values; `python manage.py generate_secrets`
  prints all three. Provider keys have no derived encryption-key fallback.
- **Breaking:** a bootstrap token re-registers only agents the `/register`
  path created (audit C2). Migration 0066 adds `bootstrap_registered` with no
  backfill, so an existing SDK agent that re-registers on start gets a 409
  until `python manage.py allow_bootstrap_reregister --tenant <tenant_id>
  <agent_id> ...` opts it in. Suspended and terminated agents stay stopped,
  and the agent type cannot change.
- **Breaking:** platform API keys get the scopes the operator picked (audit
  C3). Omitted scopes mean read only, an empty or unknown scope is refused,
  and the scopes are `read`, `write` and `admin`. Migration 0068 narrows the
  keys minted on settings/api-keys before the fix to what was picked.
- **Breaking:** the gateway and the Django proxy forward only `POST` to
  inference routes; anything else is `403 path_not_allowed` (audit T5, T8).
  The proxy, like the gateway, uses env provider keys only with
  `ALLOW_ENV_PROVIDER_KEYS=true`, and Vertex needs a region from
  `VERTEX_REGIONS` and a valid project id.
- `/admin/` is mounted only with `ENABLE_DJANGO_ADMIN=true` (audit T9). Login
  throttles key on the client address that `NUM_PROXIES` reverse proxies
  report (default 0, which ignores `X-Forwarded-For`; both compose files set
  1), and the account throttle on account and client together.
- GraphiQL is served only with `DEBUG` on. Backend responses carry a
  Content-Security-Policy and the portal sends frame-ancestors, object-src,
  base-uri and form-action. A portal session ends after
  `SESSION_IDLE_TIMEOUT_SECONDS` (default 1800) without a request (audit T14).
- An agent's `config.hub_identity.api_url` must resolve to public addresses
  unless its host is listed in `HUB_IDENTITY_ALLOWED_HOSTS` (audit T13).
- New keys keep 16 random characters in their stored prefix; migration 0067
  widens the prefix columns to 32, and keys minted before still authenticate
  (audit T10).
- GraphQL answers an anonymous caller with `UNAUTHENTICATED` rather than
  `FORBIDDEN`, and the portal sends it to the login page (audit M1).
- The assistant renders markdown images in its answers as links, never as
  images, and the portal's Content-Security-Policy allows images from the
  portal only (`img-src 'self'`) (#446).
