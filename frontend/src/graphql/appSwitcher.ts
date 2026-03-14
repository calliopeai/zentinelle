import { gql } from '@apollo/client';

export const GET_USER_APP_ACCESS = gql`
  query GetUserAppAccess {
    userAppAccess {
      hasAdminAccess
      hasPartnerAccess
      hasZentinelleAccess
      hasInternalAccess
      organizationName
      partnerName
    }
  }
`;
