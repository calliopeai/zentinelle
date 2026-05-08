import { gql } from "@apollo/client";

const NOTIFICATION_FIELDS = `
  id
  type
  subject
  message
  status
  statusDate
  metadata
  createdAt
`;

/**
 * Backend signature: notifications(first, after, status) -> list[NotificationType]
 *
 * Pass status="UNREAD" to filter to unread, or omit to fetch all.
 * Caller must apply `first` (default 50) for pagination.
 */
export const GET_NOTIFICATIONS = gql`
  query Notifications($first: Int, $after: String, $status: String) {
    notifications(first: $first, after: $after, status: $status) {
      ${NOTIFICATION_FIELDS}
    }
  }
`;

/**
 * Lightweight unread-count query: fetches only IDs + status of unread items.
 * Backend has no `unreadNotificationsCount` field — we count client-side from
 * the unread list. Capped at `first` to keep payloads small.
 */
export const GET_UNREAD_NOTIFICATIONS = gql`
  query UnreadNotifications($first: Int) {
    notifications(first: $first, status: "UNREAD") {
      id
      status
    }
  }
`;
