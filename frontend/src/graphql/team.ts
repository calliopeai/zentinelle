import { gql } from '@apollo/client';

export const GET_TEAM_MEMBERS = gql`
  query GetTeamMembers($search: String, $role: String, $first: Int, $after: String) {
    teamMembers(search: $search, role: $role, first: $first, after: $after) {
      edges {
        node {
          id
          userId
          email
          firstName
          lastName
          fullName
          role
          status
          invitedAt
          joinedAt
          lastActiveAt
          avatarUrl
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const INVITE_TEAM_MEMBER = gql`
  mutation InviteTeamMember($input: InviteTeamMemberInput!) {
    inviteTeamMember(input: $input) {
      teamMember {
        id
        email
        role
        status
      }
      errors
    }
  }
`;

export const UPDATE_TEAM_MEMBER = gql`
  mutation UpdateTeamMember($id: ID!, $input: UpdateTeamMemberInput!) {
    updateTeamMember(id: $id, input: $input) {
      teamMember {
        id
        role
        status
      }
      errors
    }
  }
`;

export const REMOVE_TEAM_MEMBER = gql`
  mutation RemoveTeamMember($id: ID!) {
    removeTeamMember(id: $id) {
      success
      errors
    }
  }
`;

export const RESEND_INVITATION = gql`
  mutation ResendInvitation($id: ID!) {
    resendInvitation(id: $id) {
      success
      errors
    }
  }
`;

export const ADMIN_RESET_PASSWORD = gql`
  mutation AdminResetPassword($username: String!) {
    adminResetPassword(input: { username: $username }) {
      success
      message
      error
    }
  }
`;
