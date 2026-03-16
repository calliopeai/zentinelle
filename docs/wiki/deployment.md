# Deployment Guide

Zentinelle is designed to run as an **internal service** — not publicly exposed. Deploy it inside your network, VPN, or private subnet. Agents connect to it from within the same trust boundary.

## Deployment Models

| Model | Description |
|-------|-------------|
| Docker Compose | Local dev or small self-hosted setups |
| Kubernetes / Helm | Production self-hosted |
| BYOC (Bring Your Own Cloud) | Your infra, Calliope AI manages remotely |
| Managed (Zentinelle.ai) | Calliope AI hosts and operates everything |

---

## Docker Compose (Self-Hosted)

Minimum setup for getting Zentinelle running:

```bash
git clone https://github.com/calliopeai/zentinelle
cd zentinelle
cp .env.example .env
# Edit .env with your values
docker compose up
```

**Services started:**
- `backend` — Django API (port 8000)
- `frontend` — GRC portal (port 3002)
- `celery` — async task worker
- `celery-beat` — periodic task scheduler
- `postgres` — PostgreSQL (port 5432)
- `redis` — cache + broker (port 6379)
- `nginx` — reverse proxy (port 80)

**Ports exposed (nginx):**
- `/api/zentinelle/` → backend
- `/gql/zentinelle/` → backend
- `/` → GRC portal

### First-Time Setup

```bash
# Run migrations
docker compose run backend python manage.py migrate

# Create superuser (for GRC portal login)
docker compose run backend python manage.py createsuperuser

# (Optional) Load sample data
docker compose run backend python manage.py loaddata fixtures/sample_policies.json
```

### Environment Variables

See `.env.example`. Key variables:

| Variable | Description |
|----------|-------------|
| `SECRET_KEY` | Django secret key |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ALLOWED_HOSTS` | Comma-separated hostnames |
| `AUTH_MODE` | `standalone` or `client_cove` |
| `CLIENT_COVE_URL` | If `AUTH_MODE=client_cove` — base URL of Client Cove |
| `ZENTINELLE_INTERNAL_TOKEN` | Shared secret for Client Cove callout |
| `ENCRYPTION_KEY` | Key for secrets encryption (Fernet) |

### Auth Modes

**Standalone** (`AUTH_MODE=standalone`): Zentinelle manages its own auth. Users log in directly to the GRC portal with username/password or OIDC. No Client Cove dependency.

**Client Cove** (`AUTH_MODE=client_cove`): Auth delegated to Client Cove. JWT tokens are validated by calling Client Cove's internal API. Used when running as part of the Calliope AI platform.

---

## Kubernetes / Helm

Helm chart: `calliopeai/zentinelle` (coming — tracked in [#10](https://github.com/calliopeai/zentinelle/issues/10))

```bash
helm repo add calliopeai https://charts.calliopeai.com
helm install zentinelle calliopeai/zentinelle \
  --namespace zentinelle \
  --create-namespace \
  --set auth.mode=standalone \
  --set database.url="postgresql://..." \
  --set redis.url="redis://..."
```

### Recommended Kubernetes Architecture

```
Namespace: zentinelle
  Deployments:
    - zentinelle-backend (Django, 2+ replicas)
    - zentinelle-frontend (Next.js, 2+ replicas)
    - zentinelle-celery (1+ replicas)
    - zentinelle-celery-beat (1 replica, leader election)
  Services:
    - zentinelle-backend (ClusterIP, port 8000)
    - zentinelle-frontend (ClusterIP, port 3002)
  Ingress:
    - /api/zentinelle/ → backend
    - /gql/zentinelle/ → backend
    - / → frontend
  External:
    - PostgreSQL (RDS, Cloud SQL, or in-cluster)
    - Redis (ElastiCache, Memorystore, or in-cluster)
```

---

## BYOC (Bring Your Own Cloud)

In BYOC mode, Zentinelle runs in **your** infrastructure. Calliope AI manages it remotely via an outbound-only management plane connection.

```
Your Cloud (VPC / private subnet)
  └── Zentinelle
        └── management-agent (sidecar)
              │ outbound HTTPS only
              ▼
        Calliope AI Management Plane
          - Version management
          - Remote config push
          - Fleet health monitoring
          - Incident surfacing
```

The management agent makes outbound calls only. No inbound ports required from Calliope AI's side. Your data never leaves your cloud.

**BYOC setup:** Contact [support@zentinelle.ai](mailto:support@zentinelle.ai) or your Calliope AI account team.

---

## Production Checklist

- [ ] PostgreSQL with daily backups and point-in-time recovery
- [ ] Redis with persistence enabled (`appendonly yes`)
- [ ] TLS termination at ingress (nginx or load balancer)
- [ ] `ENCRYPTION_KEY` stored in secrets manager (not in `.env`)
- [ ] `SECRET_KEY` rotated from default
- [ ] `ALLOWED_HOSTS` set to your actual hostnames
- [ ] Celery workers have sufficient replicas for event volume
- [ ] Log aggregation configured (CloudWatch, Datadog, etc.)
- [ ] Backup and restore tested

## Scaling Notes

- **Event volume**: The Celery event processing worker is the primary scaling surface. Each worker handles ~500 events/sec. Scale horizontally.
- **Policy evaluation**: Backend is stateless — scale horizontally behind a load balancer.
- **High-volume agents**: Use batch event submission (`POST /events` with array) to reduce connection overhead.
- **DB separation**: When ready to split from a shared DB, run `pg_dump --schema=zentinelle` and restore as `public` schema in a new database. Update `DATABASE_URL`.
