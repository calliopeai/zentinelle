import { gql } from "@apollo/client";

export const GET_RETENTION_DATA = gql`
  query RetentionData {
    retentionPolicies {
      id
      name
      description
      entityType
      retentionDays
      minimumRetentionDays
      expirationAction
      expirationActionDisplay
      entityTypeDisplay
      complianceRequirement
      complianceRequirementDisplay
      enabled
      priority
    }
    legalHolds {
      id
      name
      status
      holdType
      holdTypeDisplay
      statusDisplay
      effectiveDate
      expirationDate
      isActive
    }
  }
`;
