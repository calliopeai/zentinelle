import { gql } from '@apollo/client';

export const GET_API_KEYS = gql`
  query APIKeys {
    apiKeys {
      edges {
        node {
          id
          name
          description
          status
          scopes
          keyPrefix
          lastUsedAt
          createdAt
          expiresAt
        }
      }
    }
  }
`;

export const CREATE_PLATFORM_API_KEY = gql`
  mutation CreatePlatformAPIKey($name: String!, $description: String, $scopes: [String]) {
    createPlatformApiKey(name: $name, description: $description, scopes: $scopes) {
      ok
      apiKey
      keyPrefix
      keyId
      error
    }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeAPIKey($id: ID!) {
    revokeApiKey(id: $id) {
      ok
      error
    }
  }
`;

export const DELETE_API_KEY = gql`
  mutation DeleteAPIKey($id: ID!) {
    deleteApiKey(id: $id) {
      ok
      error
    }
  }
`;
