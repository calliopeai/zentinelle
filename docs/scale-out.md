# Scale-out and draining

What lets each Zentinelle component run as N replicas behind an autoscaler,
what each one exports for the scaler to read, and how each leaves without
dropping work. The installer's scaling policies (floors, ceilings, target
values) live in the installer; this page is what they scale on.

## Gateway (Go)

Any replica serves any request. Rate limits, budgets and policy are decided
by the backend on every request, the provider-key cache is per replica and at
most 60 seconds stale, and each request's usage is reported once by the
replica that served it, deduplicated by event ID on retry.

| | |
|---|---|
| Readiness | `GET /ready`: 503 from SIGTERM on. Use it for the target group health check and the readiness probe. `/health` stays 200 |
| Drain | `SHUTDOWN_DELAY_SECONDS` (5) serving with `/ready` failing, then `DRAIN_TIMEOUT_SECONDS` (20) for requests and streams in flight, then 5 seconds for usage reports |
| Stop timeout | At least 30 seconds with the defaults; raise with the drain timeout (ECS allows 120). The ALB deregistration delay bounds a stream too |
| Scale on (ECS) | With `METRICS_EMF_INTERVAL_SECONDS` set: `RequestsInFlight` (Average, per replica), `RequestLatency` (p95), `Requests`, in `METRICS_EMF_NAMESPACE` (`Zentinelle/Gateway`), no dimensions |
| Scale on (EKS) | `zentinelle_gateway_active_connections` (in flight) and `zentinelle_gateway_request_duration_seconds` on `/metrics` |

Details: [gateway README](https://github.com/calliopeai/zentinelle/blob/main/gateway/README.md#scale-out-and-draining).
`python3 scripts/gateway_scale_load.py` proves it locally against stubs: three
replicas, scale-out and scale-in under load, no failed request, every request
metered once.

## Temporal worker

| | |
|---|---|
| Drain | On SIGTERM the worker stops polling and running activities get `TEMPORAL_WORKER_DRAIN_SECONDS` (25) to finish. One still running after that is cut: a task declared with retries runs again on another worker, a single-attempt one fails and is picked up by its next schedule or retry sweep. Set the drain to cover the longest task you need to survive a scale-in |
| Stop timeout | The drain plus 5 seconds; raise both together |
| Scale on (ECS) | Every `TEMPORAL_BACKLOG_METRIC_SECONDS` (60; 0 off) each worker writes `ApproximateBacklogCount` and `ApproximateBacklogAgeSeconds` for its task queue, dimension `TaskQueue`, in `TEMPORAL_BACKLOG_METRIC_NAMESPACE` (`Zentinelle/Temporal`). Every replica reports the same queue, so scale on `Maximum` |
| Scale on (EKS) | KEDA's Temporal scaler, on the namespace and task queue (`TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`) |

The backlog comes from `DescribeTaskQueue`: approximate backlog count and age
where the server reports task queue stats, the backlog count hint (no age) on
an older server. A failed read writes nothing, so a Temporal blip never looks
like an empty queue.

## Backend

Counters that limit traffic are shared by every process: rate limits, the
daily token budget, session quotas and prompt-tester limits are atomic Redis
increments, and budgets are row-locked in the database. Nothing else is held
in process memory across requests except caches of public or bounded data
(OIDC discovery documents, the hourly model list).

| | |
|---|---|
| Readiness | `/api/zentinelle/v1/health` |
| Connections | `DB_CONN_MAX_AGE` (seconds, 0 by default) keeps each gunicorn worker's connection, health-checked before reuse. A fleet holds tasks x 2 workers x 3 aliases connections; put RDS Proxy or PgBouncer in front so that number never reaches the database |
| Poolers | `DB_DISABLE_SERVER_SIDE_CURSORS=true` behind any pooler. Each alias selects its schema with a `SET search_path` when its connection opens, not the libpq `options` startup parameter, which PgBouncer 1.26 mis-routes on Postgres 17 and earlier (#484). PgBouncer does not track that `SET` before Postgres 18, so use session mode there; transaction mode keeps the schema only on Postgres 18, which reports `search_path`. RDS Proxy is untested. Check any pooler with the query below |

Before pointing `DATABASE_URL` at a pooler, check that every alias lands in its
own schema through it, on a fresh connection each time. One pass over the
aliases can pass on a pooler that mis-routes, so the check repeats each alias
and then mixes them at random. It runs one client at a time, so it does not
prove transaction mode, where clients share server connections.

```bash
python manage.py shell -c "
import random
from django.db import connections
want = {'default': 'public', 'zentinelle': 'zentinelle', 'analytics': 'zentinelle_analytics'}
runs = [a for a in want for _ in range(20)] + random.choices(list(want), k=200)
wrong = 0
for alias in runs:
    with connections[alias].cursor() as c:
        c.execute('select current_schema()')
        wrong += c.fetchone()[0] != want[alias]
    connections[alias].close()
print(wrong, 'of', len(runs), 'wrong')"
```

It must print `0 of 260 wrong`. Behind RDS Proxy, also watch
`DatabaseConnectionsCurrentlySessionPinned`.
