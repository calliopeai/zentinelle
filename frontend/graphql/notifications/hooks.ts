"use client";

import { useQuery, useMutation } from "@apollo/client/react";
import {
  GET_NOTIFICATIONS,
  GET_UNREAD_NOTIFICATIONS,
} from "./queries";
import {
  UPDATE_NOTIFICATION,
  MARK_ALL_NOTIFICATIONS_READ,
} from "./mutations";
import type {
  NotificationsData,
  NotificationsVariables,
  UnreadNotificationsData,
  UnreadNotificationsVariables,
  UpdateNotificationResult,
  UpdateNotificationVariables,
  MarkAllNotificationsReadResult,
} from "./types";

/**
 * Full notifications list. Defaults to fetching the most recent 50.
 * Pass `status: "UNREAD"` to filter to unread-only.
 */
export function useNotifications(variables?: NotificationsVariables) {
  const { data, loading, error, refetch } = useQuery<
    NotificationsData,
    NotificationsVariables
  >(GET_NOTIFICATIONS, {
    variables: { first: 50, ...variables },
    fetchPolicy: "cache-and-network",
  });

  return {
    data,
    notifications: data?.notifications ?? [],
    loading,
    error,
    refetch,
  };
}

/**
 * Unread notifications — used by the bell badge + sidebar count.
 *
 * Polls every `pollIntervalMs` (default 30s). Caller can disable polling by
 * passing `pollIntervalMs: 0`.
 */
export function useUnreadNotifications(opts?: {
  first?: number;
  pollIntervalMs?: number;
}) {
  const first = opts?.first ?? 50;
  const pollInterval = opts?.pollIntervalMs ?? 30_000;

  const { data, loading, error, refetch, startPolling, stopPolling } = useQuery<
    UnreadNotificationsData,
    UnreadNotificationsVariables
  >(GET_UNREAD_NOTIFICATIONS, {
    variables: { first },
    fetchPolicy: "cache-and-network",
    pollInterval: pollInterval > 0 ? pollInterval : undefined,
    notifyOnNetworkStatusChange: false,
  });

  const items = data?.notifications ?? [];
  return {
    unreadCount: items.length,
    capped: items.length >= first,
    loading,
    error,
    refetch,
    startPolling,
    stopPolling,
  };
}

export function useUpdateNotification() {
  return useMutation<UpdateNotificationResult, UpdateNotificationVariables>(
    UPDATE_NOTIFICATION,
    {
      // Refetch both lists so the bell + page stay in sync.
      refetchQueries: [
        { query: GET_UNREAD_NOTIFICATIONS, variables: { first: 50 } },
      ],
      awaitRefetchQueries: false,
    },
  );
}

export function useMarkAllNotificationsRead() {
  return useMutation<MarkAllNotificationsReadResult>(
    MARK_ALL_NOTIFICATIONS_READ,
    {
      refetchQueries: [
        { query: GET_UNREAD_NOTIFICATIONS, variables: { first: 50 } },
      ],
      awaitRefetchQueries: false,
    },
  );
}
