variable "region" {
  description = "AWS region for this environment"
  type        = string
  default     = "us-west-2"
}

# -----------------------------------------------------------------------------
# Production Environment Variables
# Override defaults via terraform.tfvars or -var flags.
# -----------------------------------------------------------------------------

# Container runtime selection — enable one or both
variable "enable_ecs" {
  description = "Enable ECS Fargate container runtime"
  type        = bool
  default     = true
}

variable "enable_eks" {
  description = "Enable EKS Kubernetes container runtime"
  type        = bool
  default     = false
}

# ECS settings
variable "backend_image" {
  description = "Docker image for the backend ECS task (ECR URI)"
  type        = string
  default     = "nginx:latest"
}

variable "frontend_image" {
  description = "Docker image for the frontend ECS task (ECR URI)"
  type        = string
  default     = "nginx:latest"
}

variable "backend_cpu" {
  description = "ECS task CPU units for backend service"
  type        = number
  default     = 1024
}

variable "backend_memory" {
  description = "ECS task memory (MiB) for backend service"
  type        = number
  default     = 2048
}

variable "celery_cpu" {
  description = "ECS task CPU units for Celery worker"
  type        = number
  default     = 1024
}

variable "celery_memory" {
  description = "ECS task memory (MiB) for Celery worker"
  type        = number
  default     = 2048
}

variable "celery_beat_cpu" {
  description = "ECS task CPU units for Celery Beat scheduler"
  type        = number
  default     = 256
}

variable "celery_beat_memory" {
  description = "ECS task memory (MiB) for Celery Beat scheduler"
  type        = number
  default     = 512
}

variable "frontend_cpu" {
  description = "ECS task CPU units for frontend service"
  type        = number
  default     = 512
}

variable "frontend_memory" {
  description = "ECS task memory (MiB) for frontend service"
  type        = number
  default     = 1024
}

# Database (Aurora Serverless v2)
variable "db_min_capacity" {
  description = "Aurora Serverless v2 minimum ACU"
  type        = number
  default     = 0.5
}

variable "db_max_capacity" {
  description = "Aurora Serverless v2 maximum ACU"
  type        = number
  default     = 16
}

# Cache
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r7g.large"
}

# Bastion
variable "allowed_bastion_ips" {
  description = "CIDR blocks allowed to SSH into the bastion host"
  type        = list(string)
  default     = []
}

variable "bastion_key_name" {
  description = "EC2 key pair name for the bastion host"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Environment identity
#
# These were hardcoded in locals, which meant the stack could only ever be
# applied to one account, in one region, for one domain. They are variables so
# an operator can define their own environment.
# -----------------------------------------------------------------------------

variable "name" {
  description = "Resource name prefix. Must be unique per account+region to avoid collisions."
  type        = string
  default     = "prd-zentinelle"
}

variable "env" {
  description = "Environment name, used in tags and DJANGO_SETTINGS_MODULE selection"
  type        = string
  default     = "production"
}

variable "owner" {
  description = "Owner tag applied to every resource"
  type        = string
  default     = "calliopeai"
}

variable "domain" {
  description = "Domain this environment serves. The operator must control DNS for it."
  type        = string
  default     = "zentinelle.ai"
}

# -----------------------------------------------------------------------------
# Networking
#
# Every CIDR here is a collision risk against an operator's existing VPCs and
# any peered or transit-attached network. Override them.
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.100.0.0/16"
}

variable "azs" {
  description = "Availability zones. Empty list selects the first 3 available in the region."
  type        = list(string)
  default     = []
}

variable "public_subnets" {
  description = "Public subnet CIDRs, one per AZ"
  type        = list(string)
  default     = ["10.100.1.0/24", "10.100.2.0/24", "10.100.3.0/24"]
}

variable "private_subnets" {
  description = "Private subnet CIDRs, one per AZ"
  type        = list(string)
  default     = ["10.100.11.0/24", "10.100.12.0/24", "10.100.13.0/24"]
}

variable "database_subnets" {
  description = "Database subnet CIDRs, one per AZ"
  type        = list(string)
  default     = ["10.100.21.0/24", "10.100.22.0/24", "10.100.23.0/24"]
}

variable "cache_subnets" {
  description = "Cache subnet CIDRs, one per AZ"
  type        = list(string)
  default     = ["10.100.31.0/24", "10.100.32.0/24", "10.100.33.0/24"]
}

# -----------------------------------------------------------------------------
# DNS and TLS
#
# The stack used to unconditionally create a Route53 zone for `domain` and then
# block on ACM DNS validation against it. If the domain's nameservers point
# anywhere else (Cloudflare, another registrar, another account) that zone is
# never authoritative, validation never succeeds, and the apply hangs for ~45
# minutes and then fails. These switches let an operator bring an existing zone,
# bring an existing certificate, or skip public DNS entirely.
# -----------------------------------------------------------------------------

variable "create_route53_zone" {
  description = "Create a Route53 public zone for `domain`. Set false to use an existing zone via route53_zone_id."
  type        = bool
  default     = true
}

variable "route53_zone_id" {
  description = "Existing Route53 zone id to use when create_route53_zone is false"
  type        = string
  default     = ""
}

variable "create_acm_certificate" {
  description = "Request an ACM certificate for `domain`. Requires DNS validation to be resolvable, so the zone must be authoritative."
  type        = bool
  default     = true
}

variable "acm_certificate_arn" {
  description = "Existing validated ACM certificate ARN to use when create_acm_certificate is false"
  type        = string
  default     = ""
}

variable "manage_dns_records" {
  description = "Create the app and wildcard A records pointing at the ALB. Set false when DNS is managed outside this stack."
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Container registry
# -----------------------------------------------------------------------------

variable "create_ecr_repositories" {
  description = "Create ECR repositories for the backend, frontend and gateway images"
  type        = bool
  default     = true
}

variable "ecr_keep_images" {
  description = "Number of tagged images to retain per repository"
  type        = number
  default     = 10
}
