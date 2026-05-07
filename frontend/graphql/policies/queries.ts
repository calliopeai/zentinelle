import { gql } from "@apollo/client";

const POLICY_FIELDS = `
  id
  name
  description
  policyType
  scopeType
  config
  priority
  enforcement
  enabled
  createdAt
  updatedAt
  scopeName
  createdByUsername
`;

export const GET_POLICIES = gql`
  query GetPolicies($search: String, $policyType: String, $scopeType: String) {
    policies(search: $search, policyType: $policyType, scopeType: $scopeType) {
      ${POLICY_FIELDS}
    }
  }
`;

export const GET_POLICY = gql`
  query GetPolicy($id: ID) {
    policy(id: $id) {
      ${POLICY_FIELDS}
    }
  }
`;

export const GET_POLICY_OPTIONS = gql`
  query GetPolicyOptions {
    policyOptions {
      policyTypes {
        value
        label
        description
        category
        configSchema
      }
      scopeTypes {
        value
        label
      }
      enforcementLevels {
        value
        label
        description
      }
    }
  }
`;
