# Zentinelle Frontend

Operator UI for **Zentinelle** — Agent GRC (Governance, Risk, Compliance) for AI agents in the Calliope AI ecosystem.

Next.js application that lets governance, risk, and security teams author policies, review evidence, and investigate decisions made by the [`zentinelle-backend`](https://hub.docker.com/r/calliopeai/zentinelle-backend) and [`zentinelle-gateway`](https://hub.docker.com/r/calliopeai/zentinelle-gateway).

## Quick Start

```bash
docker pull calliopeai/zentinelle-frontend:latest
```

### Run

```bash
docker run --rm \
  -e NEXT_PUBLIC_API_URL=https://api.your-zentinelle-install.example \
  -e NEXT_PUBLIC_GQL_URL=https://api.your-zentinelle-install.example/graphql \
  -p 3002:3002 \
  calliopeai/zentinelle-frontend:latest
```

The image runs the standalone Next.js server (`node server.js`) on port `3002`.

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
