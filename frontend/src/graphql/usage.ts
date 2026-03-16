import { gql } from '@apollo/client';

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
