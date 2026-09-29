import { gql } from "@apollo/client";

export const CREATE_PLATFORM_API_KEY = gql`
  mutation CreatePlatformAPIKey($name: String!, $scopes: [String!]) {
    createPlatformApiKey(name: $name, scopes: $scopes) {
      apiKey
      keyPrefix
      keyId
      ok
      error
    }
  }
`;

export const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($id: ID!) {
    revokeApiKey(id: $id) {
      ok
      error
    }
  }
`;

export const DELETE_API_KEY = gql`
  mutation DeleteApiKey($id: ID!) {
    deleteApiKey(id: $id) {
      ok
      error
    }
  }
`;
