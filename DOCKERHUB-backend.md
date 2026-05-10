# Zentinelle Backend

Control plane API for **Zentinelle** — Agent GRC (Governance, Risk, Compliance) for AI agents in the Calliope AI ecosystem.

Django service that defines policies, evaluates runtime decisions, and records evidence + audit trails for AI agent activity.

## Quick Start

```bash
docker pull calliopeai/zentinelle-backend:latest
```

### Run

```bash
docker run --rm \
  -e DATABASE_URL=postgres://... \
  -p 8000:8000 \
  calliopeai/zentinelle-backend:latest
```

The container runs `gunicorn config.wsgi:application` on port `8000`.

Pair with [`calliopeai/zentinelle-frontend`](https://hub.docker.com/r/calliopeai/zentinelle-frontend) for the UI and [`calliopeai/zentinelle-gateway`](https://hub.docker.com/r/calliopeai/zentinelle-gateway) for the runtime policy gateway.

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
