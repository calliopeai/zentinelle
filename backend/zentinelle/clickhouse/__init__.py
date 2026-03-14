"""
ClickHouse integration for Zentinelle audit event analytics.

Streams audit events and agent events to ClickHouse for
long-term storage and analytics queries.

Configuration:
    Set CLICKHOUSE_URL environment variable to enable.
    If not set, all operations are no-ops (graceful degradation).
"""
