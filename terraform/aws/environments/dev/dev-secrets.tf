# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${local.name}-db-credentials"
  description = "Database credentials for ${local.name}"

  tags = merge(local.tags, {
    Name    = "${local.name}-db-credentials"
    Purpose = "Database authentication"
  })
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.postgres.username
    password = random_password.db_password.result
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = aws_db_instance.postgres.db_name
    url      = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${aws_db_instance.postgres.db_name}"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${local.name}-app-secrets"
  description = "Application secrets for ${local.name}"

  tags = merge(local.tags, {
    Name    = "${local.name}-app-secrets"
    Purpose = "Application configuration secrets"
  })
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    SECRET_KEY                  = random_password.django_secret_key.result
    ZENTINELLE_BOOTSTRAP_SECRET = random_password.bootstrap_secret.result
    # Fernet key for LLM provider key encryption. The backend refuses to boot
    # without it under prod settings, so its absence was not a degraded mode:
    # gunicorn workers died on import and the service never came up.
    # Fernet requires exactly 32 url-safe base64 bytes, which is why this is a
    # random_id rendered as b64_url rather than a random_password.
    ZENTINELLE_SECRET_KEY = "${random_id.llm_key_encryption.b64_url}="
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "random_password" "django_secret_key" {
  length  = 64
  special = false
}

resource "random_password" "bootstrap_secret" {
  length  = 64
  special = false
}

# 32 bytes, rendered url-safe base64, to satisfy Fernet's key format.
resource "random_id" "llm_key_encryption" {
  byte_length = 32
}
