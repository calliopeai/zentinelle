import { gql } from "@apollo/client";

export const GET_USAGE_METRICS = gql`
  query GetUsageMetrics($startDate: DateTime, $endDate: DateTime, $endpointId: ID) {
    usageMetrics(startDate: $startDate, endDate: $endDate, endpointId: $endpointId) {
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
