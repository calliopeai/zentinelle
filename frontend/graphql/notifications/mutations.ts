import { gql } from "@apollo/client";

/**
 * Backend signature: updateNotification(id: ID!, status: String!)
 *   status accepts "READ" or "UNREAD".
 *
 * The frontend exposes a friendlier `markRead`/`markUnread` API in hooks.ts
 * that maps a boolean to the underlying status string.
 */
export const UPDATE_NOTIFICATION = gql`
  mutation UpdateNotification($id: ID!, $status: String!) {
    updateNotification(id: $id, status: $status) {
      notification {
        id
        status
        statusDate
      }
      errors
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
