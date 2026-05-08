import { gql } from "@apollo/client";

export const UPDATE_ORGANIZATION_SETTINGS = gql`
  mutation UpdateOrganizationSettings($settings: OrganizationSettingsInput!) {
    updateOrganizationSettings(settings: $settings) {
      success
      organization {
        id
        name
        slug
        tier
        deploymentModel
        zentinelleTier
        settings
        createdAt
      }
    }
  }
`;
