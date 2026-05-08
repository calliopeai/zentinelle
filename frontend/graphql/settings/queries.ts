import { gql } from "@apollo/client";

export const GET_MY_ORGANIZATION = gql`
  query GetMyOrganization {
    myOrganization {
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
`;
