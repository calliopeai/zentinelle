import { gql } from '@apollo/client';

export const GET_SECRET_BUNDLES = gql`
  query GetSecretBundles($search: String, $secretType: String, $first: Int, $after: String) {
    secretBundles(search: $search, secretType: $secretType, first: $first, after: $after) {
      edges {
        node {
          id
          name
          slug
          description
          secretType
          providerConfigs
          rotationEnabled
          rotationIntervalDays
          lastRotated
          nextRotation
          enabledProviders
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_SECRET_BUNDLE = gql`
  query GetSecretBundle($id: ID!) {
    secretBundle(id: $id) {
      id
      name
      slug
      description
      secretType
      providerConfigs
      rotationEnabled
      rotationIntervalDays
      lastRotated
      nextRotation
      enabledProviders
      createdAt
      updatedAt
    }
  }
`;

export const CREATE_SECRET_BUNDLE = gql`
  mutation CreateSecretBundle($organizationId: UUID!, $input: CreateSecretBundleInput!) {
    createSecretBundle(organizationId: $organizationId, input: $input) {
      secretBundle {
        id
        name
        slug
      }
      success
      error
    }
  }
`;

export const UPDATE_SECRET_BUNDLE = gql`
  mutation UpdateSecretBundle($input: UpdateSecretBundleInput!) {
    updateSecretBundle(input: $input) {
      secretBundle {
        id
        name
        description
      }
      success
      error
    }
  }
`;

export const DELETE_SECRET_BUNDLE = gql`
  mutation DeleteSecretBundle($id: ID!) {
    deleteSecretBundle(id: $id) {
      success
      error
    }
  }
`;

export const ROTATE_SECRET_BUNDLE = gql`
  mutation RotateSecretBundle($id: ID!) {
    rotateSecretBundle(id: $id) {
      secretBundle {
        id
        lastRotated
        nextRotation
      }
      success
      error
    }
  }
`;
