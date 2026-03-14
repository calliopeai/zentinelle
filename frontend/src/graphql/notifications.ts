import { gql } from '@apollo/client';

export const GET_NOTIFICATIONS = gql`
  query GetNotifications($first: Int, $after: String, $status: String) {
    notifications(first: $first, after: $after, status: $status) {
      edges {
        node {
          id
          subject
          message
          status
          statusDate
          createdAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_UNREAD_COUNT = gql`
  query GetUnreadNotificationCount {
    notifications(first: 1, status: "UNREAD") {
      totalCount
    }
  }
`;

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    updateNotification(input: { id: $id, status: "READ" }) {
      notification {
        id
        status
      }
      errors {
        field
        messages
      }
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead {
      success
      count
    }
  }
`;
