import { gql } from '@apollo/client';

export const GET_CLIENT_COVE_INTEGRATION = gql`
  query GetClientCoveIntegration {
    clientCoveIntegration {
      id
      clientCoveUrl
      apiKeyPreview
      isActive
      status
      statusMessage
      connectedOrgName
      lastTestedAt
    }
  }
`;

export const TEST_CLIENT_COVE_CONNECTION = gql`
  mutation TestClientCoveConnection($url: String!, $apiKey: String!) {
    testClientCoveConnection(url: $url, apiKey: $apiKey) {
      success
      message
      orgName
    }
  }
`;

export const SAVE_CLIENT_COVE_CONFIG = gql`
  mutation SaveClientCoveConfig($url: String!, $apiKey: String!) {
    saveClientCoveConfig(url: $url, apiKey: $apiKey) {
      success
      message
      integration {
        id
        clientCoveUrl
        apiKeyPreview
        isActive
        status
        statusMessage
        lastTestedAt
      }
    }
  }
`;

export const DISCONNECT_CLIENT_COVE = gql`
  mutation DisconnectClientCove {
    disconnectClientCove {
      success
    }
  }
`;
