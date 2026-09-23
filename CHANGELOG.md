# Changelog

Notable changes to Zentinelle. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Gateway: per-tenant provider keys (#380). The gateway injects the provider
  key the agent's tenant stored in Zentinelle (Settings > LLM providers), read
  through the new `POST /api/zentinelle/v1/gateway/provider-key` with the agent
  key plus the gateway token, and cached for 60 seconds. Each release of a key
  is audited, without the value.
- Gateway token: `ZENTINELLE_GATEWAY_TOKEN`, or else the file at
  `ZENTINELLE_GATEWAY_TOKEN_FILE` (default `/var/run/zentinelle/gateway-token`),
  on both the backend and the gateway. In compose the backend mints it into a
  volume both containers mount, so no configuration is needed;
  `make gateway-token` writes one to `.env` instead. The Kubernetes manifest
  mounts a generated Secret. A rotated token needs no restart on either side.

### Changed

- The gateway never forwards a client-supplied provider key: `Authorization`,
  `x-api-key`, `x-goog-api-key` and Google's `key` query parameter are dropped
  on every request.
- **Breaking:** the gateway no longer uses its own env provider keys unless
  `ALLOW_ENV_PROVIDER_KEYS=true`, and refuses to start with no token (variable
  or file) and no allowed env key. Compose installs keep working through the
  minted token; any other deployment sets the token on both sides.

### Deprecated

- `ALLOW_ENV_PROVIDER_KEYS`. Still honoured, with a warning at startup, and to
  be removed in a future release: store provider keys per tenant in Zentinelle
  instead.
