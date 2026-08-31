# -----------------------------------------------------------------------------
# ACM — TLS Certificates (DNS-validated via Route53, optional)
#
# ACM will not issue until it can resolve the validation record on the public
# internet. That means the zone holding it must be authoritative for `domain`.
# Creating a Route53 zone does NOT make it authoritative; the registrar's
# nameservers have to point at it. When they do not, aws_acm_certificate_validation
# blocks for ~45 minutes and then fails the whole apply.
#
# Set create_acm_certificate = false and pass acm_certificate_arn to bring a
# certificate you already validated by whatever means.
# -----------------------------------------------------------------------------

resource "aws_acm_certificate" "wildcard" {
  count = var.create_acm_certificate ? 1 : 0

  domain_name               = local.domain
  subject_alternative_names = ["*.${local.domain}"]
  validation_method         = "DNS"

  tags = merge(local.tags, {
    Name = "${local.name}-wildcard-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = var.create_acm_certificate && var.create_route53_zone ? {
    for dvo in aws_acm_certificate.wildcard[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.route53_zone_id
}

resource "aws_acm_certificate_validation" "wildcard" {
  count = var.create_acm_certificate && var.create_route53_zone ? 1 : 0

  certificate_arn         = aws_acm_certificate.wildcard[0].arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
