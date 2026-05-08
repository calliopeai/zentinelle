/**
 * Notification status — backend uses uppercase enum strings.
 */
export type NotificationStatus = "UNREAD" | "READ";

/**
 * Notification type — backend `Notification.Type` choices. Lowercase snake_case.
 * Treated as a string at runtime (server may add new types) — narrow the union
 * for type-safety when branching on known values.
 */
export type NotificationKind =
  | "policy_violation"
  | "budget_warning"
  | "high_risk"
  | "incident_opened"
  | (string & {});

/**
 * UI severity bucket derived from `type`. Not stored on the model — see
 * `severityForType` in NotificationBell / notifications page.
 */
export type NotificationSeverity = "critical" | "warning" | "info";

export interface NotificationData {
  id: string;
  type: NotificationKind;
  subject: string;
  message: string;
  status: NotificationStatus;
  statusDate: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationsData {
  notifications: NotificationData[];
}

export interface NotificationsVariables {
  first?: number | null;
  after?: string | null;
  status?: NotificationStatus | null;
}

export interface UnreadNotificationsData {
  notifications: Pick<NotificationData, "id" | "status">[];
}

export interface UnreadNotificationsVariables {
  first?: number | null;
}

export interface UpdateNotificationResult {
  updateNotification: {
    notification: {
      id: string;
      status: NotificationStatus;
      statusDate: string | null;
    } | null;
    errors: string[];
  };
}

export interface UpdateNotificationVariables {
  id: string;
  status: NotificationStatus;
}

export interface MarkAllNotificationsReadResult {
  markAllNotificationsRead: {
    success: boolean | null;
    count: number | null;
  };
}
