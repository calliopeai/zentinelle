# Zentinelle Wiki

Knowledge base for the Zentinelle AI GRC platform.

## Contents

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, component map, data flow, deployment topology |
| [API Reference](api.md) | REST API for agent integration (register, evaluate, events, etc.) |
| [SDK Guide](sdk.md) | SDK usage, framework plugins, resilience patterns |
| [Policy Reference](policies.md) | Policy types, scope hierarchy, evaluation logic |
| [Compliance Frameworks](compliance.md) | SOC2, GDPR, HIPAA, EU AI Act, NIST AI RMF |
| [Deployment Guide](deployment.md) | Self-hosting, Docker, Kubernetes, BYOC |
| [Development Guide](development.md) | Local setup, testing, GraphQL workflow, migrations |

## Product Context

Zentinelle is a **runtime governance layer for AI agents**. It sits between your agent code and the LLM, enforcing policies before execution and capturing telemetry after.

```
Agent Code
    │
    ▼
Zentinelle SDK
    │ evaluate() — pre-execution policy check
    ▼
LLM Provider (any of 21)
    │
    ▼
Zentinelle SDK
    │ emit() — post-execution telemetry
    ▼
Zentinelle Service
    │
    ├── Policy Engine
    ├── Content Scanner
    ├── Event Store
    ├── Compliance Engine
    └── GRC Portal (Next.js)
```

## Deployment Models

| Model | Description |
|-------|-------------|
| Self-hosted | Docker Compose or Kubernetes. MIT licensed. No callhome required. |
| Managed cloud | Calliope hosts and operates Zentinelle. |
| BYOC | Deploy in your cloud. Calliope manages remotely via management plane. |
| Forward deployed | Calliope engineer embedded in your infra. For regulated industries. |

## Key Design Principles

- **Fail-open**: If Zentinelle is unreachable, agents continue running (configurable per policy).
- **Provider-agnostic**: Works with all 21 LLM providers. Policy evaluation is model-agnostic.
- **Tenant isolation**: Every resource is scoped to a `tenant_id`. No cross-tenant data access.
- **Audit-first**: Everything is logged. Logs are tamper-evident. Retention is configurable.
- **SDK is thin**: The SDK does registration, evaluation, and telemetry. Business logic lives in the service.
