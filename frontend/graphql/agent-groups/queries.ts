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

export const GET_AGENT_GROUPS = gql`
  query GetAgentGroups($search: String, $tier: String) {
    agentGroups(search: $search, tier: $tier) {
      ${AGENT_GROUP_FIELDS}
    }
  }
`;
