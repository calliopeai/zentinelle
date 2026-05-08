import { gql } from "@apollo/client";

const COMPLIANCE_ALERT_FIELDS = `
  id
  alertType
  severity
  title
  description
  userIdentifier
  violationCount
  firstViolationAt
  lastViolationAt
  status
  acknowledgedAt
  resolvedAt
  resolutionNotes
  metadata
  createdAt
  alertTypeDisplay
  severityDisplay
  statusDisplay
  endpointName
  acknowledgedByUsername
  resolvedByUsername
`;

export const GET_COMPLIANCE_ALERTS = gql`
  query ComplianceAlerts(
    $status: String
    $severity: String
    $alertType: String
  ) {
    complianceAlerts(
      status: $status
      severity: $severity
      alertType: $alertType
    ) {
      ${COMPLIANCE_ALERT_FIELDS}
    }
  }
`;
