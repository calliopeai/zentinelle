import { gql } from '@apollo/client';

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

export const GET_POLICIES = gql`
  query GetPolicies($search: String, $policyType: String, $scopeType: String, $first: Int, $after: String) {
    policies(search: $search, policyType: $policyType, scopeType: $scopeType, first: $first, after: $after) {
      edges {
        node {
          id
          name
          description
          policyType
          scopeType
          scopeName
          config
          priority
          enforcement
          enabled
          createdByUsername
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const GET_POLICY = gql`
  query GetPolicy($id: ID!) {
    policy(id: $id) {
      id
      name
      description
      policyType
      scopeType
      scopeName
      config
      priority
      enforcement
      enabled
      createdByUsername
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_POLICY = gql`
  mutation CreatePolicy($organizationId: UUID!, $input: CreatePolicyInput!) {
    createPolicy(organizationId: $organizationId, input: $input) {
      policy {
        id
        name
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
        enabled
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

export const TOGGLE_POLICY = gql`
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

export const DUPLICATE_POLICY = gql`
  mutation DuplicatePolicy($id: ID!, $newName: String) {
    duplicatePolicy(id: $id, newName: $newName) {
      policy {
        id
        name
      }
      success
      error
    }
  }
`;

// Get all policies for hierarchy view (grouped by scope)
export const GET_POLICIES_FOR_HIERARCHY = gql`
  query GetPoliciesForHierarchy($first: Int) {
    policies(first: $first) {
      edges {
        node {
          id
          name
          description
          policyType
          scopeType
          scopeName
          config
          priority
          enforcement
          enabled
        }
      }
    }
  }
`;

// Get policy inheritance chain for a specific context
export const GET_EFFECTIVE_POLICIES = gql`
  query GetEffectivePolicies($deploymentId: ID, $endpointId: ID, $userId: String) {
    effectivePolicies(deploymentId: $deploymentId, endpointId: $endpointId, userId: $userId) {
      edges {
        node {
          id
          name
          policyType
          scopeType
          scopeName
          config
          priority
          enabled
          inheritedFrom
          overrides
        }
      }
    }
  }
`;
