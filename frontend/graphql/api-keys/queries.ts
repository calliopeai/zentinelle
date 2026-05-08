import { gql } from "@apollo/client";

export const GET_API_KEYS = gql`
  query ApiKeys($search: String, $status: String) {
    apiKeys(search: $search, status: $status) {
      id
      name
      description
      keyPrefix
      status
      scopes
      lastUsedAt
      expiresAt
      createdAt
      createdBy
    }
  }
`;
