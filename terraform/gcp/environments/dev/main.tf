# EXPERIMENTAL — In Progress
# GCP support is under active development. Not yet validated against
# a live GCP project. Contributions welcome.

# -----------------------------------------------------------------------------
# Zentinelle — GCP Development Environment
# -----------------------------------------------------------------------------

terraform {
  # Backend configured via -backend-config at init time.
  # See gcp/config.env for project/region settings.
  # Run: ./run.sh init gcp dev
  #
  # backend "gcs" {
  #   bucket = "tf-state-zentinelle"
  #   prefix = "gcp/dev"
  # }
}

locals {
  name         = "dev-zentinelle"
  env          = "development"
  region       = var.region
  project_id   = var.project_id
  service_name = "zentinelle"
  owner        = "calliopeai"
  ver          = "1.0"
  domain       = "dev.zentinelle.ai"
  vpc_cidr     = "10.0.0.0/16"

  labels = {
    project     = "zentinelle"
    service     = local.service_name
    environment = local.env
    owner       = local.owner
    managed-by  = "terraform"
  }
}

data "google_project" "current" {
  project_id = local.project_id
}

data "google_client_config" "current" {}

# =============================================================================
# VPC + Subnets + Cloud NAT
# =============================================================================

resource "google_compute_network" "vpc" {
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false
  project                 = local.project_id
}

resource "google_compute_subnetwork" "public" {
  name          = "${local.name}-public"
  ip_cidr_range = "10.0.1.0/24"
  region        = local.region
  network       = google_compute_network.vpc.id
  project       = local.project_id

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_subnetwork" "private" {
  name                     = "${local.name}-private"
  ip_cidr_range            = "10.0.11.0/24"
  region                   = local.region
  network                  = google_compute_network.vpc.id
  project                  = local.project_id
  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }

  secondary_ip_range {
    range_name    = "${local.name}-pods"
    ip_cidr_range = "10.1.0.0/16"
  }

  secondary_ip_range {
    range_name    = "${local.name}-services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

resource "google_compute_router" "router" {
  name    = "${local.name}-router"
  region  = local.region
  network = google_compute_network.vpc.id
  project = local.project_id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${local.name}-nat"
  router                             = google_compute_router.router.name
  region                             = local.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  project                            = local.project_id

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# =============================================================================
# Firewall Rules
# =============================================================================

resource "google_compute_firewall" "allow_health_checks" {
  name    = "${local.name}-allow-health-checks"
  network = google_compute_network.vpc.id
  project = local.project_id

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "3002", "8000"]
  }

  source_ranges = [
    "130.211.0.0/22",
    "35.191.0.0/16",
  ]

  target_tags = ["${local.name}-allow-hc"]
  description = "Allow Google Cloud health check probes"
}

resource "google_compute_firewall" "allow_internal" {
  name    = "${local.name}-allow-internal"
  network = google_compute_network.vpc.id
  project = local.project_id

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "icmp"
  }

  source_ranges = ["10.0.0.0/16"]
  description   = "Allow internal VPC traffic"
}

resource "google_compute_firewall" "deny_all_ingress" {
  name     = "${local.name}-deny-all-ingress"
  network  = google_compute_network.vpc.id
  project  = local.project_id
  priority = 65534

  deny {
    protocol = "all"
  }

  source_ranges = ["0.0.0.0/0"]
  description   = "Default deny all ingress"
}

# =============================================================================
# Cloud SQL PostgreSQL 16
# =============================================================================

resource "google_compute_global_address" "private_ip" {
  name          = "${local.name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
  project       = local.project_id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.name}-db"
  database_version = "POSTGRES_16"
  region           = local.region
  project          = local.project_id

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 20
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day          = 1
      hour         = 4
      update_track = "stable"
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    database_flags {
      name  = "idle_in_transaction_session_timeout"
      value = "60000"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = true
    }

    user_labels = local.labels
  }

  deletion_protection = false
}

resource "google_sql_database" "zentinelle" {
  name     = "zentinelle"
  instance = google_sql_database_instance.postgres.name
  project  = local.project_id
}

resource "google_sql_user" "zentinelle" {
  name     = "zentinelle"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
  project  = local.project_id
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# =============================================================================
# Memorystore Redis 7
# =============================================================================

resource "google_redis_instance" "redis" {
  name           = "${local.name}-redis"
  tier           = "BASIC"
  memory_size_gb = var.redis_memory_size_gb
  region         = local.region
  project        = local.project_id

  redis_version = "REDIS_7_0"

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_configs = {
    maxmemory-policy = "volatile-lru"
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "MONDAY"
      start_time {
        hours   = 6
        minutes = 0
      }
    }
  }

  labels = local.labels

  depends_on = [google_service_networking_connection.private_vpc]
}

# =============================================================================
# Cloud Storage
# =============================================================================

resource "google_storage_bucket" "files" {
  name     = "${local.name}-files-${local.project_id}"
  location = local.region
  project  = local.project_id

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  cors {
    origin          = ["https://${local.domain}", "https://*.${local.domain}"]
    method          = ["GET", "PUT", "POST"]
    response_header = ["Content-Type", "ETag"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age = 7
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  labels = merge(local.labels, {
    purpose = "backups-exports-documents"
  })
}

# =============================================================================
# Secret Manager
# =============================================================================

resource "google_secret_manager_secret" "db_credentials" {
  secret_id = "${local.name}-db-credentials"
  project   = local.project_id

  replication {
    auto {}
  }

  labels = merge(local.labels, {
    purpose = "database-authentication"
  })
}

resource "google_secret_manager_secret_version" "db_credentials" {
  secret = google_secret_manager_secret.db_credentials.id

  secret_data = jsonencode({
    username = google_sql_user.zentinelle.name
    password = random_password.db_password.result
    host     = google_sql_database_instance.postgres.private_ip_address
    port     = 5432
    dbname   = google_sql_database.zentinelle.name
    instance = google_sql_database_instance.postgres.connection_name
    url      = "postgresql://${google_sql_user.zentinelle.name}:${random_password.db_password.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.zentinelle.name}"
  })
}

resource "google_secret_manager_secret" "app_secrets" {
  secret_id = "${local.name}-app-secrets"
  project   = local.project_id

  replication {
    auto {}
  }

  labels = merge(local.labels, {
    purpose = "application-configuration-secrets"
  })
}

resource "google_secret_manager_secret_version" "app_secrets" {
  secret = google_secret_manager_secret.app_secrets.id

  secret_data = jsonencode({
    SECRET_KEY                  = random_password.django_secret_key.result
    ZENTINELLE_BOOTSTRAP_SECRET = random_password.bootstrap_secret.result
  })
}

resource "random_password" "django_secret_key" {
  length  = 64
  special = false
}

resource "random_password" "bootstrap_secret" {
  length  = 64
  special = false
}

# =============================================================================
# Cloud DNS
# =============================================================================

resource "google_dns_managed_zone" "main" {
  name        = "${local.name}-zone"
  dns_name    = "${local.domain}."
  description = "DNS zone for ${local.domain}"
  project     = local.project_id

  labels = local.labels
}

# =============================================================================
# Cloud Monitoring
# =============================================================================

resource "google_monitoring_notification_channel" "email" {
  display_name = "${local.name}-alerts"
  type         = "email"
  project      = local.project_id

  labels = {
    email_address = "alerts@zentinelle.ai"
  }

  user_labels = local.labels
}
