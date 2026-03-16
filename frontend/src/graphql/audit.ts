import { gql } from '@apollo/client';

export const GET_AUDIT_LOGS = gql`
  query GetAuditLogs(
    $search: String
    $actor: String
    $action: String
    $resource: String
    $startDate: DateTime
    $endDate: DateTime
    $first: Int
    $after: String
  ) {
    auditLogs(
      search: $search
      actor: $actor
      action: $action
      resource: $resource
      startDate: $startDate
      endDate: $endDate
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          timestamp
          actor {
            id
            email
            name
            type
          }
          action
          resource
          resourceId
          resourceName
          status
          ipAddress
          userAgent
          details
          changes {
            field
            oldValue
            newValue
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export const GET_AUDIT_LOG = gql`
  query GetAuditLog($id: ID!) {
    auditLog(id: $id) {
      id
      timestamp
      actor {
        id
        email
        name
        type
      }
      action
      resource
      resourceId
      resourceName
      status
      ipAddress
      userAgent
      details
      changes {
        field
        oldValue
        newValue
      }
      metadata
    }
  }
`;

export const EXPORT_AUDIT_LOGS = gql`
  mutation ExportAuditLogs($format: String!, $startDate: DateTime!, $endDate: DateTime!) {
    exportAuditLogs(format: $format, startDate: $startDate, endDate: $endDate) {
      downloadUrl
      errors
    }
  }
`;

export const GET_AUDIT_ANALYTICS = gql`
  query GetAuditAnalytics($days: Int) {
    auditAnalytics(days: $days) {
      timeline { bucket eventType count }
      byType { eventType count }
      topAgents { agentId eventCount }
    }
  }
`;

// Get audit logs for a specific policy (version history)
export const GET_POLICY_VERSIONS = gql`
  query GetPolicyVersions($policyId: ID!, $first: Int, $after: String) {
    auditLogs(
      resource: "policy"
      resourceId: $policyId
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          timestamp
          actor {
            id
            email
            name
            type
          }
          action
          resourceName
          status
          details
          changes {
            field
            oldValue
            newValue
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
