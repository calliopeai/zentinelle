variable "region" {
  description = "GCP region for this environment"
  type        = string
  default     = "us-west1"
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

# -----------------------------------------------------------------------------
# Dev Environment Variables
# Override defaults via terraform.tfvars or -var flags.
# -----------------------------------------------------------------------------

# Container runtime selection — enable one or both
variable "enable_cloud_run" {
  description = "Enable Cloud Run container runtime"
  type        = bool
  default     = true
}

variable "enable_gke" {
  description = "Enable GKE Kubernetes container runtime"
  type        = bool
  default     = false
}

# Cloud Run settings
variable "backend_image" {
  description = "Docker image for the backend Cloud Run service (Artifact Registry URI)"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "frontend_image" {
  description = "Docker image for the frontend Cloud Run service (Artifact Registry URI)"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

# Database
variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-f1-micro"
}

# Cache
variable "redis_memory_size_gb" {
  description = "Memorystore Redis memory size in GB"
  type        = number
  default     = 1
}
