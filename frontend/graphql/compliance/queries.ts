import { gql } from "@apollo/client";

export const GET_COMPLIANCE_OVERVIEW = gql`
  query GetComplianceOverview {
    complianceOverview {
      observeCapabilities {
        id
        name
        description
        capabilityType
        enabled
        supportingPolicies
        supportingRules
        enforcementOptions
        supportsFrameworks
      }
      controlCapabilities {
        id
        name
        description
        capabilityType
        enabled
        supportingPolicies
        supportingRules
        enforcementOptions
        supportsFrameworks
      }
      capabilitiesEnabled
      capabilitiesTotal
      frameworkCoverage {
        id
        name
        description
        requiredCovered
        requiredTotal
        requiredPercentage
        missingRequired
        totalCovered
        totalCount
        totalPercentage
        missingRecommended
      }
    }
  }
`;
