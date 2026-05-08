import { gql } from "@apollo/client";

export const SIMULATE_POLICY = gql`
  query SimulatePolicy(
    $policyType: String!
    $config: JSON!
    $enforcement: String
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
      wouldPass
      impactPercent
      blockedSamples
      simulatedPolicyType
      lookbackDays
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
    wouldPass: number;
    impactPercent: number;
    blockedSamples: string[];
    simulatedPolicyType: string | null;
    lookbackDays: number;
  };
};
