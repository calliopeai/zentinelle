import { gql } from "@apollo/client";

const ENDPOINT_FIELDS = `
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
  createdAt
  updatedAt
  deploymentName
  agentGroup {
    id
    name
    slug
    color
    tier
  }
`;

export const GET_ENDPOINTS = gql`
  query GetEndpoints($search: String, $status: String, $agentType: String) {
    endpoints(search: $search, status: $status, agentType: $agentType) {
      ${ENDPOINT_FIELDS}
    }
  }
`;

export const GET_ENDPOINT = gql`
  query GetEndpoint($id: ID) {
    endpoint(id: $id) {
      ${ENDPOINT_FIELDS}
    }
  }
`;
