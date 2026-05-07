import { gql } from "@apollo/client";

export const GET_EVENTS = gql`
  query GetEvents(
    $eventType: String
    $category: String
    $endpointId: ID
    $userId: String
  ) {
    events(
      eventType: $eventType
      category: $category
      endpointId: $endpointId
      userId: $userId
    ) {
      id
      eventType
      eventCategory
      status
      payload
      userIdentifier
      occurredAt
      processedAt
      correlationId
      endpointName
    }
  }
`;

export const GET_AUDIT_LOGS = gql`
  query GetAuditLogs(
    $search: String
    $actor: String
    $action: String
    $resource: String
    $resourceType: String
    $resourceId: String
    $startDate: DateTime
    $endDate: DateTime
  ) {
    auditLogs(
      search: $search
      actor: $actor
      action: $action
      resource: $resource
      resourceType: $resourceType
      resourceId: $resourceId
      startDate: $startDate
      endDate: $endDate
    ) {
      id
      action
      resourceType
      resourceId
      resourceName
      metadata
      apiKeyPrefix
      ipAddress
      userAgent
      timestamp
      actor {
        id
        email
        name
        type
      }
      resource
      status
      details
      changes {
        field
        oldValue
        newValue
      }
    }
  }
`;

export const GET_AUDIT_ANALYTICS = gql`
  query GetAuditAnalytics($days: Int) {
    auditAnalytics(days: $days) {
      timeline {
        bucket
        eventType
        count
      }
      byType {
        eventType
        count
      }
      topAgents {
        agentId
        eventCount
      }
    }
  }
`;
