import { gql } from "@apollo/client";

export const ACKNOWLEDGE_COMPLIANCE_ALERT = gql`
  mutation AcknowledgeComplianceAlert($id: ID!) {
    acknowledgeComplianceAlert(id: $id) {
      success
      alertId
    }
  }
`;

export const RESOLVE_COMPLIANCE_ALERT = gql`
  mutation ResolveComplianceAlert($id: ID!, $notes: String) {
    resolveComplianceAlert(id: $id, notes: $notes) {
      success
      alertId
    }
  }
`;

export const DISMISS_COMPLIANCE_ALERT = gql`
  mutation DismissComplianceAlert($id: ID!) {
    dismissComplianceAlert(id: $id) {
      success
      alertId
    }
  }
`;
