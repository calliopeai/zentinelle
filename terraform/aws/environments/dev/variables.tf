variable "region" {
  description = "AWS region for this environment"
  type        = string
  default     = "us-west-2"
}

# -----------------------------------------------------------------------------
# Dev Environment Variables
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
  default     = 512
}

variable "backend_memory" {
  description = "ECS task memory (MiB) for backend service"
  type        = number
  default     = 1024
}

variable "celery_cpu" {
  description = "ECS task CPU units for Celery worker"
  type        = number
  default     = 512
}

variable "celery_memory" {
  description = "ECS task memory (MiB) for Celery worker"
  type        = number
  default     = 1024
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
  default     = 256
}

variable "frontend_memory" {
  description = "ECS task memory (MiB) for frontend service"
  type        = number
  default     = 512
}

# Database
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

# Cache
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t4g.micro"
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
