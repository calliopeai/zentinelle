import { gql } from "@apollo/client";

export const RUN_COMPLIANCE_CHECK = gql`
  mutation RunComplianceCheck {
    runComplianceCheck {
      success
      assessmentId
      errors
    }
  }
`;

export const TOGGLE_FRAMEWORK = gql`
  mutation ToggleFramework($frameworkId: String!, $enabled: Boolean!) {
    toggleFramework(frameworkId: $frameworkId, enabled: $enabled) {
      framework {
        id
        enabled
      }
      errors
    }
  }
`;

export const ACTIVATE_COMPLIANCE_PACK = gql`
  mutation ActivateCompliancePack($packId: String!) {
    activateCompliancePack(packId: $packId) {
      success
      error
      packName
      packVersion
      policiesCreated
      policiesUpdated
    }
  }
`;
