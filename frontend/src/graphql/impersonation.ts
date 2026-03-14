import { gql } from '@apollo/client';

export const GET_IMPERSONATION_STATUS = gql`
  query GetImpersonationStatus {
    impersonationStatus {
      isImpersonating
      realUserEmail
      effectiveUserEmail
      canImpersonate
      expiresAt
      minutesRemaining
      session {
        id
        startedAt
        expiresAt
        reason
        targetEmail
      }
    }
  }
`;

export const GET_IMPERSONATABLE_USERS = gql`
  query GetImpersonatableUsers($search: String, $limit: Int) {
    impersonatableUsers(search: $search, limit: $limit) {
      id
      email
      fullName
      isStaff
      isSuperuser
      organizationName
      organizationId
      partnerName
    }
  }
`;

export const GET_IMPERSONATION_HISTORY = gql`
  query GetImpersonationHistory($limit: Int) {
    impersonationHistory(limit: $limit) {
      id
      impersonatorEmail
      targetEmail
      startedAt
      endedAt
      isActive
      reason
      durationMinutes
    }
  }
`;

export const GET_IMPERSONATION_AUDIT_LOGS = gql`
  query GetImpersonationAuditLogs(
    $actorId: Int
    $targetId: Int
    $action: String
    $limit: Int
  ) {
    impersonationAuditLogs(
      actorId: $actorId
      targetId: $targetId
      action: $action
      limit: $limit
    ) {
      id
      actorEmail
      targetEmail
      action
      actionDisplay
      reason
      details
      ipAddress
      timestamp
    }
  }
`;

export const START_IMPERSONATION = gql`
  mutation StartImpersonation(
    $userId: Int!
    $reason: String
    $durationHours: Int
    $partnerId: UUID
  ) {
    startImpersonation(
      userId: $userId
      reason: $reason
      durationHours: $durationHours
      partnerId: $partnerId
    ) {
      success
      errors
      session {
        id
        startedAt
        expiresAt
        targetEmail
      }
    }
  }
`;

export const STOP_IMPERSONATION = gql`
  mutation StopImpersonation {
    stopImpersonation {
      success
      errors
    }
  }
`;
