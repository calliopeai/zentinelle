# -----------------------------------------------------------------------------
# Aurora Serverless v2 PostgreSQL 16 (production)
# -----------------------------------------------------------------------------

resource "aws_rds_cluster" "aurora" {
  cluster_identifier = "${local.name}-db"

  engine         = "aurora-postgresql"
  engine_mode    = "provisioned"
  engine_version = "16.4"

  database_name   = "zentinelle"
  master_username = "zentinelle"
  master_password = random_password.db_password.result

  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  storage_encrypted = true

  backup_retention_period      = 30
  preferred_backup_window      = "03:00-04:00"
  preferred_maintenance_window = "Mon:04:00-Mon:05:00"

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-db-final-${formatdate("YYYYMMDD", timestamp())}"

  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name

  serverlessv2_scaling_configuration {
    min_capacity = var.db_min_capacity
    max_capacity = var.db_max_capacity
  }

  tags = merge(local.tags, {
    Name   = "${local.name}-db"
    Engine = "aurora-postgresql-16"
  })

  lifecycle {
    ignore_changes = [final_snapshot_identifier]
  }
}

resource "aws_rds_cluster_instance" "aurora" {
  count = 2

  identifier         = "${local.name}-db-${count.index + 1}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version

  performance_insights_enabled = true

  tags = merge(local.tags, {
    Name = "${local.name}-db-${count.index + 1}"
  })
}

resource "aws_rds_cluster_parameter_group" "aurora" {
  name_prefix = "${local.name}-aurora-pg16-"
  family      = "aurora-postgresql16"
  description = "Aurora PostgreSQL 16 parameter group for ${local.name}"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "60000"
  }

  tags = merge(local.tags, {
    Name = "${local.name}-aurora-pg16-params"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# -----------------------------------------------------------------------------
# Create zentinelle_analytics schema via null resource
# -----------------------------------------------------------------------------

resource "null_resource" "analytics_schema" {
  depends_on = [aws_rds_cluster.aurora]

  provisioner "local-exec" {
    command = <<-EOT
      echo "NOTE: Run the following SQL on the database after provisioning:"
      echo "  CREATE SCHEMA IF NOT EXISTS zentinelle_analytics;"
      echo "  GRANT ALL ON SCHEMA zentinelle_analytics TO zentinelle;"
    EOT
  }
}
