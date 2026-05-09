import { gql } from "@apollo/client";

const AGENT_GROUP_FIELDS = `
  id
  name
  slug
  description
  tier
  color
  createdAt
  agentCount
`;

export const CREATE_AGENT_GROUP = gql`
  mutation CreateAgentGroup(
    $name: String!
    $description: String
    $tier: String
    $color: String
  ) {
    createAgentGroup(
      name: $name
      description: $description
      tier: $tier
      color: $color
    ) {
      group {
        ${AGENT_GROUP_FIELDS}
      }
      errors
    }
  }
`;

export const UPDATE_AGENT_GROUP = gql`
  mutation UpdateAgentGroup(
    $id: ID!
    $name: String
    $description: String
    $tier: String
    $color: String
  ) {
    updateAgentGroup(
      id: $id
      name: $name
      description: $description
      tier: $tier
      color: $color
    ) {
      group {
        ${AGENT_GROUP_FIELDS}
      }
      errors
    }
  }
`;

export const DELETE_AGENT_GROUP = gql`
  mutation DeleteAgentGroup($id: ID!) {
    deleteAgentGroup(id: $id) {
      success
      errors
    }
  }
`;

export const ASSIGN_AGENT_TO_GROUP = gql`
  mutation AssignAgentToGroup($agentId: ID!, $groupId: ID!) {
    assignAgentToGroup(agentId: $agentId, groupId: $groupId) {
      success
      errors
    }
  }
`;
