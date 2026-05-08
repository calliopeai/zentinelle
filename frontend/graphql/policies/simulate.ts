import { gql } from "@apollo/client";

export const SIMULATE_POLICY = gql`
  query SimulatePolicy(
    $policyType: String!
    $config: JSON!
    $enforcement: String!
    $lookbackDays: Int
  ) {
    simulatePolicy(
      policyType: $policyType
      config: $config
      enforcement: $enforcement
      lookbackDays: $lookbackDays
    ) {
      totalEvents
      wouldBlock
      wouldWarn
      wouldAllow
      sampleBlocked
      sampleWarned
    }
  }
`;

export const GET_POLICY_ANALYZER = gql`
  query PolicyAnalyzer {
    policies {
      id
      name
      policyType
      scopeType
      enforcement
      enabled
      priority
      config
    }
    endpoints {
      id
      agentId
      name
      agentType
      status
    }
  }
`;

export type SimulatePolicyResult = {
  simulatePolicy: {
    totalEvents: number;
    wouldBlock: number;
    wouldWarn: number;
    wouldAllow: number;
    sampleBlocked: string[];
    sampleWarned: string[];
  };
};
