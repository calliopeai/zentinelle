# -----------------------------------------------------------------------------
# Security Groups — Shared (data layer + bastion)
#
# Compute-specific SGs (ALB, ECS, EKS) live in ecs/ and eks/ submodules.
# Data-layer SGs use VPC CIDR so both ECS and EKS workloads can connect.
# -----------------------------------------------------------------------------

# RDS — accepts traffic from private subnets
resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
    description = "PostgreSQL from within VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name}-rds-sg"
  })
}

# Redis — accepts traffic from private subnets
resource "aws_security_group" "redis" {
  name_prefix = "${local.name}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [local.vpc_cidr]
    description = "Redis from within VPC"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name}-redis-sg"
  })
}

# Bastion — SSH from specific IPs only
resource "aws_security_group" "bastion" {
  name_prefix = "${local.name}-bastion-"
  description = "Security group for bastion host"
  vpc_id      = module.vpc.vpc_id

  dynamic "ingress" {
    for_each = length(var.allowed_bastion_ips) > 0 ? [1] : []
    content {
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.allowed_bastion_ips
      description = "SSH from allowed IPs"
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, {
    Name = "${local.name}-bastion-sg"
  })
}
