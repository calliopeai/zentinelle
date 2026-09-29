# Zentinelle Gateway

Runtime policy gateway for **Zentinelle** — Agent GRC (Governance, Risk, Compliance) for AI agents in the Calliope AI ecosystem.

Lightweight Go service that sits in front of LLM and tool traffic for AI agents, enforcing policies authored in [`zentinelle-backend`](https://hub.docker.com/r/calliopeai/zentinelle-backend) and emitting evidence for audit.

## Quick Start

```bash
docker pull calliopeai/zentinelle-gateway:latest
```

### Run

```bash
docker run --rm \
  -e ZENTINELLE_URL=https://api.your-zentinelle-install.example \
  -e ZENTINELLE_GATEWAY_CREDENTIAL=<this gateway's sk_gateway_ credential> \
  -p 8742:8742 \
  calliopeai/zentinelle-gateway:latest
```

The image runs a statically-linked binary on port `8742`.

### Provider keys

The gateway injects the provider key the agent's tenant stored in Zentinelle,
so one gateway serves many tenants on their own provider accounts. A provider
key sent by the client is always dropped, never forwarded. Each gateway is
registered on Zentinelle with the tenants it serves and has its own credential
(`python manage.py gateway_credential register <name> --tenant <id>`); keys are
released only for those tenants.

| Variable | Default | Description |
|----------|---------|-------------|
| `ZENTINELLE_URL` | `http://localhost:8080` | Zentinelle backend base URL |
| `ZENTINELLE_GATEWAY_CREDENTIAL` | - | This gateway's own registered credential (`sk_gateway_...`) |
| `ZENTINELLE_GATEWAY_CREDENTIAL_FILE` | `/var/run/zentinelle/gateway-credential` | Read the credential from this file when the variable above is unset: a mounted Secret on Kubernetes, or, in a standalone compose install, a file the backend writes into a volume both containers mount. The gateway waits up to 60s for it at startup and reads it again after a rotation |
| `ALLOW_ENV_PROVIDER_KEYS` | `false` | **Deprecated**, to be removed: per-tenant stored keys replace it. Single-tenant only: use `PROVIDER_KEY_<NAME>` (or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) for a tenant with no stored key |

The container refuses to start with no credential (variable or file) and no allowed env key.

### Cluster heartbeat

A gateway that Astrolift registered for a cluster reports on it to Zentinelle:
a status judged from its own calls to Zentinelle, the image version, and
running totals of requests, blocked requests and distinct agents. It sends one
at start, then as often as Zentinelle asks (every 60 seconds today).

| Variable | Default | Description |
|----------|---------|-------------|
| `ZENTINELLE_CLUSTER_ID` | - | The cluster this gateway speaks for and reports on. The heartbeat needs it and a credential |
| `HEARTBEAT_INTERVAL_SECONDS` | `60` | Seconds between heartbeats until Zentinelle's answer names its own interval, which then wins. `0` turns them off; otherwise 10 to 3600 |

Full reference: [gateway/README.md](https://github.com/calliopeai/zentinelle/blob/main/gateway/README.md).

## Tags

| Tag | Architecture | Description |
|-----|--------------|-------------|
| `latest` | multi-arch | Latest main build |
| `X.Y.Z` | multi-arch | Tagged release |
| `X.Y.Z-amd64` / `X.Y.Z-arm64` | single-arch | Per-architecture images |
| `main-<sha>` | multi-arch | Specific commit on main |

## Source

- Repo: [github.com/calliopeai/zentinelle](https://github.com/calliopeai/zentinelle)
- License: see repo

Part of the **Calliope AI** platform: [calliope.ai](https://calliope.ai)
