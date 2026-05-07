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
