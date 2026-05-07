# -----------------------------------------------------------------------------
# ElastiCache Redis 7 (production — multi-AZ replicas)
# -----------------------------------------------------------------------------

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${local.name}-redis"
  description          = "Redis cluster for ${local.name}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = 3
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  subnet_group_name  = aws_elasticache_subnet_group.cache.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auto_minor_version_upgrade = true

  snapshot_retention_limit = 7
  snapshot_window          = "05:00-06:00"
  maintenance_window       = "mon:06:00-mon:07:00"

  tags = merge(local.tags, {
    Name   = "${local.name}-redis"
    Engine = "redis-7"
  })
}

resource "aws_elasticache_parameter_group" "redis" {
  name        = "${local.name}-redis7"
  family      = "redis7"
  description = "Redis 7 parameter group for ${local.name}"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = merge(local.tags, {
    Name = "${local.name}-redis7-params"
  })
}
