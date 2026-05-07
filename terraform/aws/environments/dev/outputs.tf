# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket" {
  description = "S3 files bucket name"
  value       = aws_s3_bucket.files.id
}

output "db_credentials_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "app_secrets_arn" {
  description = "ARN of the application secrets"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name (if enabled)"
  value       = var.enable_ecs ? module.ecs[0].cluster_name : null
}

output "ecs_backend_service_name" {
  description = "ECS backend service name (if enabled)"
  value       = var.enable_ecs ? module.ecs[0].backend_service_name : null
}

output "alb_dns_name" {
  description = "ALB DNS name (if ECS enabled)"
  value       = var.enable_ecs ? module.ecs[0].alb_dns_name : null
}

output "nameservers" {
  description = "Route53 zone nameservers — delegate from your registrar"
  value       = aws_route53_zone.main.name_servers
}
