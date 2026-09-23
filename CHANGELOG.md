# Changelog

Notable changes to Zentinelle. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

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
