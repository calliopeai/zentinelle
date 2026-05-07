# -----------------------------------------------------------------------------
# Container Runtime Loader
#
# Enables ECS, EKS, or both. Set via variables:
#   enable_ecs = true   (default)
#   enable_eks = false   (default)
#
# Each runtime brings its own ALB, security groups, IAM roles, log groups,
# and DNS records. Shared infrastructure (VPC, RDS, Redis, S3, Secrets,
# ACM, Route53 zone) lives in the environment root.
# -----------------------------------------------------------------------------

module "ecs" {
  count  = var.enable_ecs ? 1 : 0
  source = "./ecs"

  name               = local.name
  env                = local.env
  region             = local.region
  tags               = local.tags
  vpc_id             = module.vpc.vpc_id
  vpc_cidr           = local.vpc_cidr
  public_subnets     = module.vpc.public_subnets
  private_subnets    = module.vpc.private_subnets
  certificate_arn    = aws_acm_certificate.wildcard.arn
  route53_zone_id    = aws_route53_zone.main.zone_id
  domain             = local.domain
  sns_topic_arn      = aws_sns_topic.alerts.arn
  db_credentials_arn = aws_secretsmanager_secret.db_credentials.arn
  app_secrets_arn    = aws_secretsmanager_secret.app_secrets.arn
  s3_bucket_arn      = aws_s3_bucket.files.arn
  backend_image      = var.backend_image
  frontend_image     = var.frontend_image
  backend_cpu        = var.backend_cpu
  backend_memory     = var.backend_memory
  celery_cpu         = var.celery_cpu
  celery_memory      = var.celery_memory
  celery_beat_cpu    = var.celery_beat_cpu
  celery_beat_memory = var.celery_beat_memory
  frontend_cpu       = var.frontend_cpu
  frontend_memory    = var.frontend_memory
  account_id         = data.aws_caller_identity.current.account_id
  db_host            = aws_rds_cluster.aurora.endpoint
  db_port            = aws_rds_cluster.aurora.port
  db_name            = aws_rds_cluster.aurora.database_name
  db_username        = aws_rds_cluster.aurora.master_username
  redis_endpoint     = aws_elasticache_replication_group.redis.primary_endpoint_address
  redis_port         = aws_elasticache_replication_group.redis.port
}
