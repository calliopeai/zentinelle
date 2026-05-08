import { gql } from "@apollo/client";

export const GET_CONTENT_SCANS = gql`
  query GetContentScans(
    $userIdentifier: String
    $endpointId: ID
    $hasViolations: Boolean
    $contentType: String
    $startDate: DateTime
    $endDate: DateTime
  ) {
    contentScans(
      userIdentifier: $userIdentifier
      endpointId: $endpointId
      hasViolations: $hasViolations
      contentType: $contentType
      startDate: $startDate
      endDate: $endDate
    ) {
      id
      contentType
      contentTypeDisplay
      statusDisplay
      hasViolations
      violationCount
      maxSeverity
      actionTaken
      wasBlocked
      wasRedacted
      userIdentifier
      endpointName
      createdAt
    }
  }
`;

export const GET_CONTENT_VIOLATIONS = gql`
  query GetContentViolations(
    $ruleType: String
    $severity: String
    $startDate: DateTime
    $endDate: DateTime
  ) {
    contentViolations(
      ruleType: $ruleType
      severity: $severity
      startDate: $startDate
      endDate: $endDate
    ) {
      id
      ruleType
      ruleTypeDisplay
      severity
      severityDisplay
      enforcement
      matchedPattern
      matchedText
      matchStart
      matchEnd
      confidence
      category
      wasBlocked
      wasRedacted
      userNotified
      adminNotified
      createdAt
      ruleName
    }
  }
`;
