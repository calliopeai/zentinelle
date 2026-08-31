# -----------------------------------------------------------------------------
# Zentinelle — Production Environment
# -----------------------------------------------------------------------------

terraform {
  # Backend configured via -backend-config at init time.
  # See aws/config.env for project/region settings.
  # Run: ./run.sh init aws prd
  backend "s3" {}
}

locals {
  name         = var.name
  env          = var.env
  region       = var.region
  service_name = "zentinelle"
  owner        = var.owner
  ver          = "1.0"
  domain       = var.domain
  vpc_cidr     = var.vpc_cidr

  # Fall back to the first three available AZs when the operator does not pin them.
  azs = length(var.azs) > 0 ? var.azs : slice(data.aws_availability_zones.available.names, 0, 3)

  public_subnets   = var.public_subnets
  private_subnets  = var.private_subnets
  database_subnets = var.database_subnets
  cache_subnets    = var.cache_subnets

  # Resolved DNS/TLS handles: either what this stack created, or what the
  # operator brought. Everything downstream reads these, never the resources.
  route53_zone_id = var.create_route53_zone ? aws_route53_zone.main[0].zone_id : var.route53_zone_id
  certificate_arn = var.create_acm_certificate ? aws_acm_certificate.wildcard[0].arn : var.acm_certificate_arn

  tags = {
    Name        = local.name
    Project     = "zentinelle"
    Service     = local.service_name
    Owner       = local.owner
    Environment = local.env
    Region      = local.region
    ManagedBy   = "terraform"
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
