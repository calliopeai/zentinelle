import { gql } from "@apollo/client";

export const CREATE_POLICY = gql`
  mutation CreatePolicy($input: CreatePolicyInput!) {
    createPolicy(input: $input) {
      policy {
        id
        name
        policyType
        scopeType
        enforcement
        enabled
        createdAt
      }
      success
      error
    }
  }
`;

export const UPDATE_POLICY = gql`
  mutation UpdatePolicy($input: UpdatePolicyInput!) {
    updatePolicy(input: $input) {
      policy {
        id
        name
        description
        config
        priority
        enforcement
        enabled
        updatedAt
      }
      success
      error
    }
  }
`;

export const DELETE_POLICY = gql`
  mutation DeletePolicy($id: ID!) {
    deletePolicy(id: $id) {
      success
      error
    }
  }
`;

export const TOGGLE_POLICY_ENABLED = gql`
  mutation TogglePolicyEnabled($id: ID!) {
    togglePolicyEnabled(id: $id) {
      policy {
        id
        enabled
      }
      success
      error
    }
  }
`;
