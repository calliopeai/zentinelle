import { gql } from '@apollo/client';

export const GET_AI_USAGE_SUMMARY = gql`
  query GetAiUsageSummary($organizationId: ID!, $deploymentId: UUID, $days: Int) {
    aiUsageSummary(organizationId: $organizationId, deploymentId: $deploymentId, days: $days) {
      periodStart
      periodEnd
      totalRequests
      totalTokens
      totalInputTokens
      totalOutputTokens
      totalCostUsd
      byProvider {
        provider
        providerDisplay
        totalRequests
        totalTokens
        totalCostUsd
      }
      byModel {
        provider
        model
        totalRequests
        totalTokens
        totalCostUsd
      }
    }
  }
`;

export const GET_USAGE_METRICS = gql`
  query GetUsageMetrics($startDate: DateTime, $endDate: DateTime, $granularity: String) {
    usageMetrics(startDate: $startDate, endDate: $endDate, granularity: $granularity) {
      summary {
        totalApiCalls
        totalTokens
        totalCost
        activeAgents
        storageUsedMb
      }
      timeSeries {
        date
        apiCalls
        tokens
        cost
      }
      byAgent {
        agentId
        agentName
        apiCalls
        tokens
        cost
      }
      byEndpoint {
        endpoint
        apiCalls
        avgLatencyMs
      }
    }
  }
`;
