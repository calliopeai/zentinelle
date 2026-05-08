# Deployment Guide

Zentinelle is designed to run as an **internal service** — not publicly exposed. Deploy it inside your network, VPN, or private subnet. Agents connect to it from within the same trust boundary.

## Quick Start (Docker Compose, dev/internal)

Default `AUTH_MODE=open` — no login required. Just start it:

```bash
git clone https://github.com/calliopeai/zentinelle.git
cd zentinelle
cp .env.example .env
docker compose up -d
```

Open http://localhost:8080 — you're in the portal as admin.

This starts 8 services: PostgreSQL 16, Redis 7, Django backend, Celery worker + beat, Nginx reverse proxy, Next.js frontend, Go LLM gateway.

**For agents to register, generate a bootstrap token:**
```bash
docker compose exec backend python manage.py bootstrap_token generate \
  00000000-0000-0000-0000-000000000001 --label "default tenant"
```

**Access:**
- Portal: http://localhost:8080
- GraphQL: http://localhost:8080/gql/zentinelle/
- REST API: http://localhost:8080/api/zentinelle/v1/
- LLM Gateway: http://localhost:8742 (Go sidecar)
- Admin: http://localhost:8080/admin/

## Production Deployment

### 1. Generate required secrets

```bash
docker compose exec backend python manage.py generate_secrets
```

Outputs three secrets to copy into `.env`:
- `SECRET_KEY` — Django session/CSRF signing
- `ZENTINELLE_SECRET_KEY` — Fernet key for encrypting LLM provider API keys
- `ZENTINELLE_BOOTSTRAP_SECRET` — HMAC key for agent bootstrap tokens

**These are unrecoverable — losing `ZENTINELLE_SECRET_KEY` makes all stored LLM provider keys unreadable.** Back them up to your secret manager.

### 2. Configure auth mode

| Mode | Use case |
|------|----------|
| `open` | Internal/dev only — rejected in production settings |
| `local` | Built-in username/password with session cookies |
| `sso` | OIDC/SAML via Google, Okta, Cognito, Entra ID, Keycloak |

```bash
AUTH_MODE=sso
OIDC_PROVIDER_URL=https://your-idp.example.com
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

### 3. Set required env vars

```bash
DJANGO_SETTINGS_MODULE=config.settings.prod
SECRET_KEY=<generated>
ZENTINELLE_SECRET_KEY=<generated>
ZENTINELLE_BOOTSTRAP_SECRET=<generated>
ALLOWED_HOSTS=zentinelle.example.com,api.example.com
CORS_ALLOWED_ORIGINS=https://app.example.com
DATABASE_URL=postgres://user:pw@host:5432/zentinelle
REDIS_URL=redis://redis:6379/0
AUTH_MODE=sso
```

Production settings reject startup if any required secret is missing or `AUTH_MODE=open`.

### 4. Production hardening enabled automatically

In `config.settings.prod`:
- HSTS (1 year, includeSubDomains, preload)
- `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `HttpOnly`, `SameSite=Lax`
- `X-Frame-Options: DENY`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Content-Type-Options: nosniff`
- CORS allowlist (no wildcard)
- All required secrets validated at startup

---

## Architecture

```
                    ┌──────────┐
                    │  Nginx   │ :8080
                    └────┬─────┘
              ┌──────────┼──────────┐
         ┌────▼──┐  ┌────▼───┐  ┌──▼────┐
         │Frontend│  │Backend │  │ Proxy │
         │Next.js │  │Django  │  │ LLM   │
         │ :3002  │  │ :8000  │  │       │
         └────────┘  └───┬────┘  └───────┘
              ┌───────────┼───────────┐
         ┌────▼──┐  ┌─────▼────┐  ┌──▼──────────┐
         │ Redis │  │PostgreSQL│  │ ClickHouse   │
         │ :6379 │  │  :5432   │  │ (optional)   │
         └───────┘  └──────────┘  └──────────────┘
```

### Database Schemas

| Schema | Contents | Purpose |
|--------|----------|---------|
| `public` | Django auth, sessions | Framework tables |
| `zentinelle` | Agents, policies, events, risks, compliance | Core GRC data |
| `zentinelle_analytics` | UsageMetric, UsageAggregate, AuditLog | High-volume analytics |

All schemas live in the same PostgreSQL instance. Split off analytics with:
```bash
pg_dump --schema=zentinelle_analytics -f analytics_backup.sql
```

---

## Production Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Django secret key |
| `ZENTINELLE_BOOTSTRAP_SECRET` | Yes | HMAC secret for agent registration |
| `POSTGRES_HOST` | Yes | Database host |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `REDIS_URL` | Yes | Redis connection URL |
| `ALLOWED_HOSTS` | Yes | Comma-separated hostnames |
| `CSRF_TRUSTED_ORIGINS` | Yes | Frontend URL(s) |
| `DEBUG` | No | Always `false` in production |

**Optional:**

| Variable | Description |
|----------|-------------|
| `CLICKHOUSE_URL` | Enable ClickHouse analytics |
| `OIDC_DISCOVERY_URL` | Enable SSO (any OIDC provider) |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OIDC credentials |
| `ENCRYPTION_KEY` | Fernet key for secrets encryption |

---

## SSL/TLS

Use a reverse proxy for TLS termination:

```nginx
server {
    listen 443 ssl;
    server_name zentinelle.example.com;
    ssl_certificate /etc/ssl/zentinelle.crt;
    ssl_certificate_key /etc/ssl/zentinelle.key;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Scaling

| Signal | Action |
|--------|--------|
| API latency > 500ms | Add backend replicas |
| Celery queue depth > 100 | Add Celery workers |
| Analytics queries slow | Split analytics DB or add ClickHouse |
| > 1M events/day | Enable ClickHouse (`CLICKHOUSE_URL`) |

```bash
# Scale Celery workers
docker compose up -d --scale celery=3

# Enable ClickHouse
docker compose --profile analytics up -d
```

---

## Backup & Restore

```bash
# Full backup
pg_dump -U zentinelle zentinelle > backup.sql

# Core only (exclude analytics — can be rebuilt)
pg_dump -U zentinelle --schema=zentinelle zentinelle > backup_core.sql

# Restore
psql -U zentinelle zentinelle < backup.sql
```

Automated (crontab):
```bash
0 2 * * * pg_dump -U zentinelle zentinelle | gzip > /backups/zentinelle_$(date +\%Y\%m\%d).sql.gz
```

---

## Health Checks

| Endpoint | Purpose | Kubernetes |
|----------|---------|------------|
| `GET /api/zentinelle/v1/health` | Liveness | `livenessProbe` |
| `GET /api/zentinelle/v1/ready` | Readiness (DB + Redis) | `readinessProbe` |

```yaml
livenessProbe:
  httpGet:
    path: /api/zentinelle/v1/health
    port: 8000
readinessProbe:
  httpGet:
    path: /api/zentinelle/v1/ready
    port: 8000
  initialDelaySeconds: 15
```

---

## Monitoring

Built-in observability:
- **InteractionLog** — AI usage, tokens, costs per agent
- **AuditLog** — admin actions with tamper-evident hash chain
- **Events** — agent telemetry, policy violations, alerts
- **UsageMetric** — token/cost aggregations

Export via REST:
```bash
# Audit logs (CSV, NDJSON, or CEF format)
GET /api/zentinelle/v1/audit/export/?format=csv&from=2026-01-01&to=2026-12-31

# Compliance summary
GET /api/zentinelle/v1/export/summary.json
```

Webhook notifications fire automatically for policy violations, incidents, and compliance alerts when `NotificationConfig` is configured per tenant.
