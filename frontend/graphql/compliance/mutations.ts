import { gql } from "@apollo/client";

export const RUN_COMPLIANCE_CHECK = gql`
  mutation RunComplianceCheck {
    runComplianceCheck {
      success
      assessmentsCreated
      errors
    }
  }
`;

export const TOGGLE_FRAMEWORK = gql`
  mutation ToggleFramework($frameworkId: String!) {
    toggleFramework(frameworkId: $frameworkId) {
      success
      enabled
      frameworkId
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
