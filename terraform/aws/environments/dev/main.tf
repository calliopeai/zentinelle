# -----------------------------------------------------------------------------
# Zentinelle — Development Environment
# -----------------------------------------------------------------------------

terraform {
  # Backend configured via -backend-config at init time.
  # See aws/config.env for project/region settings.
  # Run: ./run.sh init aws dev
  backend "s3" {}
}

locals {
  name         = "dev-zentinelle"
  env          = "development"
  region       = var.region
  service_name = "zentinelle"
  owner        = "calliopeai"
  ver          = "1.0"
  domain       = "dev.zentinelle.ai"
  vpc_cidr     = "10.0.0.0/16"

  azs = ["${local.region}a", "${local.region}b", "${local.region}c"]

  public_subnets   = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets  = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
  database_subnets = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
  cache_subnets    = ["10.0.31.0/24", "10.0.32.0/24", "10.0.33.0/24"]

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

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
