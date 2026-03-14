-- ClickHouse schema for Zentinelle audit event analytics.
--
-- Tables use MergeTree engine with monthly partitioning for efficient
-- time-range queries and automatic data lifecycle management.
--
-- Usage:
--   Run this SQL against your ClickHouse instance to initialize the schema.
--   clickhouse-client --host <host> --query "$(cat schema.sql)"

-- =============================================================================
-- Audit Events Table
-- Stores both AuditLog (admin actions) and Event (agent activity) records.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
    event_id         UUID,
    event_type       LowCardinality(String),
    event_category   LowCardinality(String),  -- 'audit_log' or 'agent_event'
    organization_id  UUID,
    user_id          Nullable(UUID),
    agent_id         Nullable(String),         -- AgentEndpoint.agent_id (slug)
    action           LowCardinality(String),
    resource_type    LowCardinality(String),
    resource_id      String,
    resource_name    String         DEFAULT '',
    metadata         String         DEFAULT '{}',  -- JSON string
    ip_address       Nullable(IPv6),
    user_agent       String         DEFAULT '',
    correlation_id   String         DEFAULT '',
    occurred_at      DateTime64(3, 'UTC'),
    created_at       DateTime64(3, 'UTC')      DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (organization_id, event_type, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 2 YEAR
SETTINGS index_granularity = 8192;


-- =============================================================================
-- Materialized View: Event counts by type per hour
-- Pre-aggregated for fast timeline queries.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events_hourly_counts (
    hour             DateTime,
    organization_id  UUID,
    event_type       LowCardinality(String),
    event_category   LowCardinality(String),
    event_count      UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (organization_id, event_type, event_category, hour)
TTL toDateTime(hour) + INTERVAL 2 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS audit_events_hourly_counts_mv
TO audit_events_hourly_counts
AS
SELECT
    toStartOfHour(occurred_at)  AS hour,
    organization_id,
    event_type,
    event_category,
    count()                     AS event_count
FROM audit_events
GROUP BY hour, organization_id, event_type, event_category;


-- =============================================================================
-- Materialized View: Event counts by agent per day
-- For "top agents by event count" queries.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events_agent_daily (
    day              Date,
    organization_id  UUID,
    agent_id         String,
    event_type       LowCardinality(String),
    event_count      UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (organization_id, agent_id, event_type, day)
TTL toDate(day) + INTERVAL 2 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS audit_events_agent_daily_mv
TO audit_events_agent_daily
AS
SELECT
    toDate(occurred_at)  AS day,
    organization_id,
    agent_id,
    event_type,
    count()              AS event_count
FROM audit_events
WHERE agent_id IS NOT NULL AND agent_id != ''
GROUP BY day, organization_id, agent_id, event_type;


-- =============================================================================
-- Materialized View: Daily counts per organization
-- For compliance reporting: events per org.
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_events_org_daily (
    day              Date,
    organization_id  UUID,
    event_category   LowCardinality(String),
    event_count      UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (organization_id, event_category, day)
TTL toDate(day) + INTERVAL 2 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS audit_events_org_daily_mv
TO audit_events_org_daily
AS
SELECT
    toDate(occurred_at)  AS day,
    organization_id,
    event_category,
    count()              AS event_count
FROM audit_events
GROUP BY day, organization_id, event_category;
