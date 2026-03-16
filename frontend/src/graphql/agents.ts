import { gql } from '@apollo/client';

// Alias for backward compatibility
export const GET_AGENT_ENDPOINTS = gql`
  query GetAgentEndpoints($search: String, $status: String, $deploymentId: ID, $first: Int, $after: String) {
    endpoints(search: $search, status: $status, deploymentId: $deploymentId, first: $first, after: $after) {
      edges {
        node {
          id
          agentId
          name
          status
          deploymentName
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_AGENTS = gql`
  query GetAgents($search: String, $status: String, $agentType: String, $deploymentId: ID, $first: Int, $after: String) {
    endpoints(search: $search, status: $status, agentType: $agentType, deploymentId: $deploymentId, first: $first, after: $after) {
      edges {
        node {
          id
          agentId
          agentType
          name
          description
          status
          health
          capabilities
          metadata
          lastHeartbeat
          apiKeyPrefix
          deploymentName
          createdAt
          updatedAt
          group {
            id
            name
            tier
            color
          }
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

export const GET_AGENT = gql`
  query GetAgent($id: ID!) {
    endpoint(id: $id) {
      id
      agentId
      agentType
      name
      description
      status
      health
      capabilities
      metadata
      lastHeartbeat
      apiKeyPrefix
      deploymentName
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_AGENT = gql`
  mutation CreateAgentEndpoint($organizationId: UUID!, $input: CreateAgentEndpointInput!) {
    createAgentEndpoint(organizationId: $organizationId, input: $input) {
      endpoint {
        id
        agentId
        name
      }
      apiKey
      success
      error
    }
  }
`;

export const UPDATE_AGENT = gql`
  mutation UpdateAgentEndpoint($input: UpdateAgentEndpointInput!) {
    updateAgentEndpoint(input: $input) {
      endpoint {
        id
        name
        description
        status
      }
      success
      error
    }
  }
`;

export const DELETE_AGENT = gql`
  mutation DeleteAgentEndpoint($id: ID!) {
    deleteAgentEndpoint(id: $id) {
      success
      error
    }
  }
`;

export const SUSPEND_AGENT = gql`
  mutation SuspendAgentEndpoint($id: ID!, $reason: String) {
    suspendAgentEndpoint(id: $id, reason: $reason) {
      endpoint {
        id
        status
      }
      success
      error
    }
  }
`;

export const ACTIVATE_AGENT = gql`
  mutation ActivateAgentEndpoint($id: ID!) {
    activateAgentEndpoint(id: $id) {
      endpoint {
        id
        status
      }
      success
      error
    }
  }
`;

export const REGENERATE_API_KEY = gql`
  mutation RegenerateEndpointApiKey($endpointId: ID!) {
    regenerateEndpointApiKey(endpointId: $endpointId) {
      apiKey
      success
      error
    }
  }
`;

// Agent Groups
export const GET_AGENT_GROUPS = gql`
  query GetAgentGroups($search: String, $tier: String, $first: Int, $after: String) {
    agentGroups(search: $search, tier: $tier, first: $first, after: $after) {
      edges {
        node {
          id
          name
          slug
          description
          tier
          color
          agentCount
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const CREATE_AGENT_GROUP = gql`
  mutation CreateAgentGroup($name: String!, $description: String, $tier: String, $color: String) {
    createAgentGroup(name: $name, description: $description, tier: $tier, color: $color) {
      group {
        id
        name
        slug
        description
        tier
        color
        agentCount
        createdAt
      }
      errors
    }
  }
`;

export const UPDATE_AGENT_GROUP = gql`
  mutation UpdateAgentGroup($id: UUID!, $name: String, $description: String, $tier: String, $color: String) {
    updateAgentGroup(id: $id, name: $name, description: $description, tier: $tier, color: $color) {
      group {
        id
        name
        slug
        description
        tier
        color
        agentCount
      }
      errors
    }
  }
`;

export const DELETE_AGENT_GROUP = gql`
  mutation DeleteAgentGroup($id: UUID!) {
    deleteAgentGroup(id: $id) {
      success
      errors
    }
  }
`;

export const ASSIGN_AGENT_TO_GROUP = gql`
  mutation AssignAgentToGroup($agentEndpointId: UUID!, $groupId: UUID) {
    assignAgentToGroup(agentEndpointId: $agentEndpointId, groupId: $groupId) {
      success
      errors
    }
  }
`;
