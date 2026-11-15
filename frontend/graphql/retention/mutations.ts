import { gql } from "@apollo/client";

export const CREATE_RETENTION_POLICY = gql`
  mutation CreateRetentionPolicy($input: CreateRetentionPolicyInput!) {
    createRetentionPolicy(input: $input) {
      success
      policyId
      errors
    }
  }
`;

export const UPDATE_RETENTION_POLICY = gql`
  mutation UpdateRetentionPolicy($input: UpdateRetentionPolicyInput!) {
    updateRetentionPolicy(input: $input) {
      success
      policyId
      errors
    }
  }
`;

export const DELETE_RETENTION_POLICY = gql`
  mutation DeleteRetentionPolicy($id: ID!) {
    deleteRetentionPolicy(id: $id) {
      success
      errors
    }
  }
`;

export const TOGGLE_RETENTION_POLICY_ENABLED = gql`
  mutation ToggleRetentionPolicyEnabled($id: ID!, $enabled: Boolean!) {
    toggleRetentionPolicyEnabled(id: $id, enabled: $enabled) {
      success
      policyId
    }
  }
`;
