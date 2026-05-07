# -----------------------------------------------------------------------------
# Route53 — Hosted Zone (shared)
#
# DNS records pointing to ALBs are created by ecs/ and eks/ submodules.
# -----------------------------------------------------------------------------

resource "aws_route53_zone" "main" {
  name = local.domain

  tags = merge(local.tags, {
    Name = local.domain
  })
}
