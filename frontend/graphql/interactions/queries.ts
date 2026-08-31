import { gql } from "@apollo/client";

export const GET_INTERACTION_LOGS = gql`
  query GetInteractionLogs(
    $endpointId: ID
    $userIdentifier: String
    $aiProvider: String
    $hasViolations: Boolean
    $startDate: DateTime
    $endDate: DateTime
  ) {
    interactionLogs(
      endpointId: $endpointId
      userIdentifier: $userIdentifier
      aiProvider: $aiProvider
      hasViolations: $hasViolations
      startDate: $startDate
      endDate: $endDate
    ) {
      id
      interactionType
      interactionTypeDisplay
      aiProvider
      aiModel
      inputTokenCount
      outputTokenCount
      totalTokens
      estimatedCostUsd
      latencyMs
      userIdentifier
      endpointName
      hasViolations
      violationCount
      wasBlocked
      occurredAt
    }
  }
`;
