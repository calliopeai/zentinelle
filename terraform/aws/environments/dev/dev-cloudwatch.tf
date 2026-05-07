# -----------------------------------------------------------------------------
# CloudWatch — Shared (SNS topic for alerts)
#
# Compute-specific log groups and alarms live in ecs/ and eks/ submodules.
# -----------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"

  tags = merge(local.tags, {
    Name = "${local.name}-alerts"
  })
}
