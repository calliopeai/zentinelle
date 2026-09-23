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
  -e ZENTINELLE_GATEWAY_TOKEN=<same value as on the backend> \
  -p 8742:8742 \
  calliopeai/zentinelle-gateway:latest
```

The image runs a statically-linked binary on port `8742`.

### Provider keys

The gateway injects the provider key the agent's tenant stored in Zentinelle,
so one gateway serves many tenants on their own provider accounts. A provider
key sent by the client is always dropped, never forwarded.

| Variable | Default | Description |
|----------|---------|-------------|
| `ZENTINELLE_URL` | `http://localhost:8080` | Zentinelle backend base URL |
| `ZENTINELLE_GATEWAY_TOKEN` | - | Shared secret for reading each tenant's stored provider key. Set the same value as `ZENTINELLE_GATEWAY_TOKEN` on the backend. At least 32 characters. Give it only to gateways the Zentinelle operator runs |
| `ALLOW_ENV_PROVIDER_KEYS` | `false` | Single-tenant only: use `PROVIDER_KEY_<NAME>` (or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) for a tenant with no stored key |

The container refuses to start with neither a token nor an allowed env key.
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
