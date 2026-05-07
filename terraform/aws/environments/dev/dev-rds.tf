# -----------------------------------------------------------------------------
# RDS PostgreSQL 16 (standard instance for dev)
# -----------------------------------------------------------------------------

resource "aws_db_instance" "postgres" {
  identifier = "${local.name}-db"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "zentinelle"
  username = "zentinelle"
  password = random_password.db_password.result

  multi_az               = false
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  parameter_group_name = aws_db_parameter_group.postgres.name

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  skip_final_snapshot       = true
  final_snapshot_identifier = "${local.name}-db-final"
  deletion_protection       = false

  performance_insights_enabled = true

  tags = merge(local.tags, {
    Name   = "${local.name}-db"
    Engine = "postgres-16"
  })
}

resource "aws_db_parameter_group" "postgres" {
  name_prefix = "${local.name}-pg16-"
  family      = "postgres16"
  description = "PostgreSQL 16 parameter group for ${local.name}"

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
    Name = "${local.name}-pg16-params"
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
#
# The default 'zentinelle' database is created by RDS via db_name.
# The analytics schema is created post-provision for query separation.
# -----------------------------------------------------------------------------

resource "null_resource" "analytics_schema" {
  depends_on = [aws_db_instance.postgres]

  provisioner "local-exec" {
    command = <<-EOT
      echo "NOTE: Run the following SQL on the database after provisioning:"
      echo "  CREATE SCHEMA IF NOT EXISTS zentinelle_analytics;"
      echo "  GRANT ALL ON SCHEMA zentinelle_analytics TO zentinelle;"
    EOT
  }
}
