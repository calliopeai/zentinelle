import { gql } from "@apollo/client";

export const GET_USAGE_METRICS = gql`
  query GetUsageMetrics($startDate: DateTime, $endDate: DateTime) {
    usageMetrics(startDate: $startDate, endDate: $endDate) {
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
