import { gql } from '@apollo/client';

// =============================================================================
// Retention Policies - Queries
// =============================================================================

export const GET_RETENTION_POLICIES = gql`
  query GetRetentionPolicies($search: String, $entityType: String, $enabled: Boolean, $first: Int, $after: String) {
    retentionPolicies(search: $search, entityType: $entityType, enabled: $enabled, first: $first, after: $after) {
      edges {
        node {
          id
          name
          description
          entityType
          entityTypeDisplay
          deploymentName
          retentionDays
          minimumRetentionDays
          expirationAction
          expirationActionDisplay
          archiveLocation
          complianceRequirement
          complianceRequirementDisplay
          complianceNotes
          enabled
          priority
          createdByName
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_RETENTION_POLICY = gql`
  query GetRetentionPolicy($id: ID!) {
    retentionPolicy(id: $id) {
      id
      name
      description
      entityType
      entityTypeDisplay
      deploymentName
      retentionDays
      minimumRetentionDays
      expirationAction
      expirationActionDisplay
      archiveLocation
      complianceRequirement
      complianceRequirementDisplay
      complianceNotes
      enabled
      priority
      createdByName
      createdAt
      updatedAt
    }
  }
`;

// =============================================================================
// Retention Policies - Mutations
// =============================================================================

export const CREATE_RETENTION_POLICY = gql`
  mutation CreateRetentionPolicy($input: CreateRetentionPolicyInput!) {
    createRetentionPolicy(input: $input) {
      success
      policyId
      errors
    }
  }
`;

export const UPDATE_RETENTION_POLICY = gql`
  mutation UpdateRetentionPolicy($input: UpdateRetentionPolicyInput!) {
    updateRetentionPolicy(input: $input) {
      success
      policyId
      errors
    }
  }
`;

export const DELETE_RETENTION_POLICY = gql`
  mutation DeleteRetentionPolicy($id: ID!) {
    deleteRetentionPolicy(id: $id) {
      success
      errors
    }
  }
`;

export const TOGGLE_RETENTION_POLICY_ENABLED = gql`
  mutation ToggleRetentionPolicyEnabled($id: ID!, $enabled: Boolean!) {
    toggleRetentionPolicyEnabled(id: $id, enabled: $enabled) {
      success
      policyId
    }
  }
`;

// =============================================================================
// Legal Holds - Queries
// =============================================================================

export const GET_LEGAL_HOLDS = gql`
  query GetLegalHolds($holdType: String, $status: String, $first: Int, $after: String) {
    legalHolds(holdType: $holdType, status: $status, first: $first, after: $after) {
      edges {
        node {
          id
          name
          description
          referenceNumber
          holdType
          holdTypeDisplay
          status
          statusDisplay
          appliesToAll
          entityTypes
          userIdentifiers
          dataFrom
          dataTo
          effectiveDate
          expirationDate
          releasedAt
          custodianName
          custodianEmail
          notifyOnAccess
          notificationEmails
          isActive
          createdByName
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_LEGAL_HOLD = gql`
  query GetLegalHold($id: ID!) {
    legalHold(id: $id) {
      id
      name
      description
      referenceNumber
      holdType
      holdTypeDisplay
      status
      statusDisplay
      appliesToAll
      entityTypes
      userIdentifiers
      dataFrom
      dataTo
      effectiveDate
      expirationDate
      releasedAt
      custodianName
      custodianEmail
      notifyOnAccess
      notificationEmails
      metadata
      isActive
      createdByName
      releasedByName
      createdAt
      updatedAt
    }
  }
`;

// =============================================================================
// Legal Holds - Mutations
// =============================================================================

export const CREATE_LEGAL_HOLD = gql`
  mutation CreateLegalHold($input: CreateLegalHoldInput!) {
    createLegalHold(input: $input) {
      success
      holdId
      errors
    }
  }
`;

export const UPDATE_LEGAL_HOLD = gql`
  mutation UpdateLegalHold($input: UpdateLegalHoldInput!) {
    updateLegalHold(input: $input) {
      success
      holdId
      errors
    }
  }
`;

export const RELEASE_LEGAL_HOLD = gql`
  mutation ReleaseLegalHold($id: ID!, $reason: String) {
    releaseLegalHold(id: $id, reason: $reason) {
      success
      holdId
    }
  }
`;

export const DELETE_LEGAL_HOLD = gql`
  mutation DeleteLegalHold($id: ID!) {
    deleteLegalHold(id: $id) {
      success
      errors
    }
  }
`;

// =============================================================================
// Options (for dropdowns)
// =============================================================================

export const GET_RETENTION_OPTIONS = gql`
  query GetRetentionOptions {
    retentionOptions {
      entityTypes {
        value
        label
      }
      expirationActions {
        value
        label
      }
      complianceRequirements {
        value
        label
      }
    }
  }
`;

export const GET_LEGAL_HOLD_OPTIONS = gql`
  query GetLegalHoldOptions {
    legalHoldOptions {
      holdTypes {
        value
        label
      }
      statuses {
        value
        label
      }
    }
  }
`;
