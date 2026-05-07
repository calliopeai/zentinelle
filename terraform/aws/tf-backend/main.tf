# -----------------------------------------------------------------------------
# Zentinelle — Terraform State Backend (Layer 0)
#
# Creates the S3 bucket and DynamoDB table used to store Terraform remote state.
# This must be applied FIRST, before any other infrastructure.
#
# Usage:
#   cd aws/tf-backend
#   terraform init
#   terraform apply -var="project_name=zentinelle" -var="region=us-west-2"
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = "zentinelle"
      Service   = var.project_name
      Owner     = "calliopeai"
      ManagedBy = "terraform"
      Component = "tf-backend"
    }
  }
}

# -----------------------------------------------------------------------------
# S3 Bucket — Terraform State Storage
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "tfstate" {
  bucket = "tf-state.${var.project_name}.net"

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = "tf-state.${var.project_name}.net"
    Purpose = "Terraform remote state storage"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# DynamoDB Table — State Locking
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "tfstate_lock" {
  name         = "${var.project_name}-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name    = "${var.project_name}-tfstate-lock"
    Purpose = "Terraform state locking"
  }
}
