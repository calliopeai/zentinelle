import { gql } from '@apollo/client';

// Capability-based compliance query
export const GET_COMPLIANCE_OVERVIEW = gql`
  query GetComplianceOverview {
    complianceOverview {
      capabilitiesEnabled
      capabilitiesTotal
      observeCapabilities {
        id
        name
        description
        capabilityType
        enabled
        supportingPolicies
        supportingRules
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

// Legacy query - kept for backwards compatibility
export const GET_COMPLIANCE_STATUS = gql`
  query GetComplianceStatus {
    complianceStatus {
      overallScore
      lastAssessment
      nextAssessment
      frameworks {
        id
        name
        description
        enabled
        score
        status
        lastChecked
        controls {
          id
          name
          status
          severity
          description
        }
      }
      recentFindings {
        id
        title
        severity
        framework
        control
        status
        foundAt
        resolvedAt
      }
    }
  }
`;

export const GET_COMPLIANCE_REPORTS = gql`
  query GetComplianceReports($first: Int, $after: String) {
    complianceReports(first: $first, after: $after) {
      edges {
        node {
          id
          name
          framework
          generatedAt
          period
          status
          downloadUrl
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const RUN_COMPLIANCE_CHECK = gql`
  mutation RunComplianceCheck($frameworkId: ID) {
    runComplianceCheck(frameworkId: $frameworkId) {
      success
      checkId
      errors
    }
  }
`;

export const TOGGLE_FRAMEWORK = gql`
  mutation ToggleFramework($frameworkId: ID!, $enabled: Boolean!) {
    toggleFramework(frameworkId: $frameworkId, enabled: $enabled) {
      framework {
        id
        enabled
      }
      errors
    }
  }
`;
