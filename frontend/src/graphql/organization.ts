import { gql } from '@apollo/client';

export const GET_MY_ORGANIZATION = gql`
  query GetMyOrganization {
    myOrganization {
      id
      name
      slug
      tier
      website
      deploymentModel
      zentinelleTier
      aiBudgetUsd
      aiBudgetSpentUsd
      overagePolicy
      aiBudgetAlertThreshold
      settings
      createdAt
    }
  }
`;

export const GET_ORGANIZATION = gql`
  query GetOrganization($id: ID!) {
    organization(id: $id) {
      id
      name
      slug
      tier
      website
      deploymentModel
      zentinelleTier
      settings
    }
  }
`;

export const GET_ORGANIZATION_SETTINGS = gql`
  query GetOrganizationSettings {
    myOrganization {
      id
      name
      slug
      tier
      website
      deploymentModel
      zentinelleTier
      aiBudgetUsd
      aiBudgetSpentUsd
      overagePolicy
      aiBudgetAlertThreshold
      settings
      createdAt
    }
  }
`;

export const UPDATE_ORGANIZATION_SETTINGS = gql`
  mutation UpdateOrganizationSettings($settings: OrganizationSettingsInput!) {
    updateOrganizationSettings(settings: $settings) {
      success
      organization {
        id
        name
        slug
        settings
      }
    }
  }
`;
