# -----------------------------------------------------------------------------
# ECR — Container Repositories
#
# The ECS task execution role already carries AmazonEC2ContainerRegistryReadOnly
# and every task definition takes an ECR URI, but nothing created the
# repositories, so there was nowhere for an image to live. CI publishes to GHCR
# and Docker Hub; ECS cannot pull from either without registry credentials, so
# images are mirrored into ECR the same way the Astrolift release flow does it.
#
# Repository names are prefixed with `name`, so dev and prd can coexist in one
# account without colliding.
#
# Lifecycle: untagged images expire after a day and each repository keeps the
# last `ecr_keep_images` tagged images. Left unbounded, ECR quietly becomes the
# single largest line on the bill.
# -----------------------------------------------------------------------------

locals {
  ecr_repositories = var.create_ecr_repositories ? toset(["backend", "frontend", "gateway"]) : toset([])
}

resource "aws_ecr_repository" "this" {
  for_each = local.ecr_repositories

  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.tags, {
    Name      = "${local.name}-${each.key}"
    Component = each.key
  })
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the most recent ${var.ecr_keep_images} tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.ecr_keep_images
        }
        action = { type = "expire" }
      },
    ]
  })
}
