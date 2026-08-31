# -----------------------------------------------------------------------------
# Route53 — Hosted Zone (shared, optional)
#
# Only created when create_route53_zone is true. An operator whose domain is
# served elsewhere (Cloudflare, another account, another registrar) should set
# create_route53_zone = false and pass route53_zone_id, or turn DNS off with
# manage_dns_records = false.
#
# DNS records pointing to ALBs are created by ecs/ and eks/ submodules.
# -----------------------------------------------------------------------------

resource "aws_route53_zone" "main" {
  count = var.create_route53_zone ? 1 : 0

  name = local.domain

  tags = merge(local.tags, {
    Name = local.domain
  })
}
