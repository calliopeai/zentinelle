variable "location" {
  description = "Azure region for this environment"
  type        = string
  default     = "westus2"
}

variable "resource_group_name" {
  description = "Override for the resource group name (defaults to {name}-rg)"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Dev Environment Variables
# Override defaults via terraform.tfvars or -var flags.
# -----------------------------------------------------------------------------

# Container runtime selection — enable one or both
variable "enable_container_apps" {
  description = "Enable Azure Container Apps runtime"
  type        = bool
  default     = true
}

variable "enable_aks" {
  description = "Enable AKS Kubernetes container runtime"
  type        = bool
  default     = false
}

# Container Apps settings
variable "backend_image" {
  description = "Docker image for the backend Container App (ACR URI or public)"
  type        = string
  default     = "nginx:latest"
}

variable "frontend_image" {
  description = "Docker image for the frontend Container App (ACR URI or public)"
  type        = string
  default     = "nginx:latest"
}

variable "container_cpu" {
  description = "Container App CPU cores"
  type        = number
  default     = 0.5
}

variable "container_memory" {
  description = "Container App memory (Gi)"
  type        = string
  default     = "1Gi"
}

# Database
variable "postgres_sku" {
  description = "PostgreSQL Flexible Server SKU"
  type        = string
  default     = "B_Standard_B1ms"
}

# Cache
variable "redis_sku" {
  description = "Azure Cache for Redis SKU (Basic, Standard, Premium)"
  type        = string
  default     = "Basic"
}

variable "redis_family" {
  description = "Azure Cache for Redis family"
  type        = string
  default     = "C"
}

variable "redis_capacity" {
  description = "Azure Cache for Redis capacity (0-6)"
  type        = number
  default     = 0
}
