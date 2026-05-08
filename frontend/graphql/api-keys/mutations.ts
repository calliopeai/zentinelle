import { gql } from "@apollo/client";

export const CREATE_PLATFORM_API_KEY = gql`
  mutation CreatePlatformAPIKey($name: String!, $scopes: [String!]) {
    createPlatformApiKey(name: $name, scopes: $scopes) {
      apiKey {
        id
        name
        keyPrefix
        scopes
        createdAt
      }
      plaintextKey
      success
      message
    }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: ID!) {
    revokeApiKey(id: $id) {
      success
      message
    }
  }
`;

export const DELETE_API_KEY = gql`
  mutation DeleteApiKey($id: ID!) {
    deleteApiKey(id: $id) {
      success
      message
    }
  }
`;
