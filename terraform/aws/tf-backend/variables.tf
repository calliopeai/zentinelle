variable "project_name" {
  description = "Project name used in bucket and table naming"
  type        = string
  default     = "zentinelle"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "project_name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "region" {
  description = "AWS region for the state backend resources"
  type        = string
  default     = "us-west-2"
}
