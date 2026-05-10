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
  -e ZENTINELLE_BACKEND_URL=https://api.your-zentinelle-install.example \
  -p 8742:8742 \
  calliopeai/zentinelle-gateway:latest
```

The image runs a statically-linked binary on port `8742`.

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
