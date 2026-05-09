import { gql } from "@apollo/client";

export const CREATE_AGENT_ENDPOINT = gql`
  mutation CreateAgentEndpoint($input: CreateAgentEndpointInput!) {
    createAgentEndpoint(input: $input) {
      endpoint {
        id
        agentId
        agentType
        name
        status
        apiKeyPrefix
        createdAt
      }
      apiKey
      success
      error
    }
  }
`;

export const DELETE_AGENT_ENDPOINT = gql`
  mutation DeleteAgentEndpoint($id: ID!) {
    deleteAgentEndpoint(id: $id) {
      success
      error
    }
  }
`;

export const SUSPEND_AGENT_ENDPOINT = gql`
  mutation SuspendAgentEndpoint($id: ID!) {
    suspendAgentEndpoint(id: $id) {
      endpoint {
        id
        status
      }
      success
      error
    }
  }
`;

export const ACTIVATE_AGENT_ENDPOINT = gql`
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

export const REGENERATE_ENDPOINT_API_KEY = gql`
  mutation RegenerateEndpointApiKey($endpointId: ID!) {
    regenerateEndpointApiKey(endpointId: $endpointId) {
      apiKey
      success
      error
    }
  }
`;

export const UPDATE_AGENT_ENDPOINT = gql`
  mutation UpdateAgentEndpoint($input: UpdateAgentEndpointInput!) {
    updateAgentEndpoint(input: $input) {
      endpoint {
        id
        agentId
        agentType
        name
        status
        capabilities
        metadata
        updatedAt
      }
      success
      error
    }
  }
`;

export const UPDATE_ENDPOINT_STATUS = gql`
  mutation UpdateEndpointStatus($id: ID!, $status: String!) {
    updateEndpointStatus(id: $id, status: $status) {
      endpoint {
        id
        status
      }
      success
      error
    }
  }
`;
