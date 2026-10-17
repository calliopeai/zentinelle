/**
 * The Activity screens' data, from the operations the app already sends
 * (the same documents its hooks use), so a route renders a screen with
 * `<AlertsScreen {...useAlertsData(view)} …/>` and a story renders it from
 * the same mocks. Queries only: each one is skipped unless its view is on
 * screen. Mutations stay with the route, through the app's mutation helper.
 */
import { useQuery } from "@apollo/client/react";
import * as React from "react";

import { GET_COMPLIANCE_ALERTS } from "@/graphql/alerts/queries";
import type {
  ComplianceAlertsData,
  ComplianceAlertsVariables,
} from "@/graphql/alerts/types";
import { GET_AUDIT_LOGS, GET_EVENTS } from "@/graphql/events/queries";
import type {
  AuditLogListData,
  AuditLogListVariables,
  EventListData,
  EventListVariables,
} from "@/graphql/events/types";
import {
  GET_NOTIFICATIONS,
  GET_UNREAD_NOTIFICATIONS,
} from "@/graphql/notifications/queries";
import type {
  NotificationStatus,
  NotificationsData,
  NotificationsVariables,
  UnreadNotificationsData,
} from "@/graphql/notifications/types";
import { GET_INCIDENTS } from "@/graphql/risks/queries";
import type {
  IncidentListData,
  IncidentListVariables,
} from "@/graphql/risks/types";

import type { DateRange } from "../../shared/DateRangeFilter";
import type { ListSource } from "./components/list-controller";
import { useDebounced } from "../../shared/use-debounced";
import { useHeldRows } from "../../shared/use-held-rows";
import {
  NO_ALERT_FILTERS,
  type AlertFilters,
  type AlertsView,
} from "./AlertsScreen";
import { NO_EVENT_FILTERS, type EventFilters } from "./EventsScreen";
import { NO_INCIDENT_FILTERS, type IncidentFilters } from "./IncidentsScreen";

/** The bell's page size; the unread count is capped at it. */
const NOTIFICATIONS_FIRST = 50;

/** Events poll as /events does today. */
export const EVENTS_POLL_MS = 5_000;

function source<TRow>(
  rows: readonly TRow[] | undefined,
  result: {
    loading: boolean;
    error?: { message: string } | null;
    refetch: () => unknown;
  },
): ListSource<TRow> {
  return {
    rows: rows ?? [],
    loading: result.loading,
    error: result.error ?? null,
    onRetry: () => void result.refetch(),
  };
}

const orNull = (value: string) => value || null;

export function useAlertsData(view: AlertsView) {
  const [filters, onFiltersChange] =
    React.useState<AlertFilters>(NO_ALERT_FILTERS);
  const [notificationStatus, onNotificationStatusChange] = React.useState<
    NotificationStatus | ""
  >("");

  const alerts = useQuery<ComplianceAlertsData, ComplianceAlertsVariables>(
    GET_COMPLIANCE_ALERTS,
    {
      variables: {
        status: view === "open" ? "open" : null,
        severity: orNull(filters.severity),
        alertType: orNull(filters.alertType),
      },
      skip: view === "mine",
      fetchPolicy: "cache-and-network",
    },
  );
  const notifications = useQuery<NotificationsData, NotificationsVariables>(
    GET_NOTIFICATIONS,
    {
      variables: {
        first: NOTIFICATIONS_FIRST,
        status: notificationStatus || null,
      },
      skip: view !== "mine",
      fetchPolicy: "cache-and-network",
    },
  );
  const unread = useQuery<UnreadNotificationsData>(GET_UNREAD_NOTIFICATIONS, {
    variables: { first: NOTIFICATIONS_FIRST },
  });

  return {
    view,
    alerts: source(alerts.data?.complianceAlerts, alerts),
    filters,
    onFiltersChange,
    notifications: source(notifications.data?.notifications, notifications),
    notificationStatus,
    onNotificationStatusChange,
    unreadCount: unread.data ? unread.data.notifications.length : null,
  };
}

export function useIncidentsData() {
  const [filters, onFiltersChange] =
    React.useState<IncidentFilters>(NO_INCIDENT_FILTERS);
  const [search, onSearchChange] = React.useState("");
  const settled = useDebounced(search);
  const incidents = useQuery<IncidentListData, IncidentListVariables>(
    GET_INCIDENTS,
    {
      variables: {
        search: orNull(settled),
        severity: orNull(filters.severity),
        status: orNull(filters.status),
        incidentType: orNull(filters.incidentType),
      },
      fetchPolicy: "cache-and-network",
    },
  );
  return {
    incidents: source(incidents.data?.incidents, incidents),
    filters,
    onFiltersChange,
    search,
    onSearchChange,
  };
}

export function useEventsData() {
  const [filters, onFiltersChange] =
    React.useState<EventFilters>(NO_EVENT_FILTERS);
  const [live, onLiveChange] = React.useState(true);
  const events = useQuery<EventListData, EventListVariables>(GET_EVENTS, {
    variables: {
      category: orNull(filters.category),
      eventType: orNull(filters.eventType),
    },
    pollInterval: live ? EVENTS_POLL_MS : 0,
  });
  const held = useHeldRows(
    events.data?.events ?? [],
    (e) => e.id,
    `${filters.category}|${filters.eventType}`,
  );
  return {
    events: { ...source(held.rows, events) },
    filters,
    onFiltersChange,
    live,
    onLiveChange,
    heldCount: held.heldCount,
    onShowHeld: held.release,
  };
}

/** A date input's day as the query's DateTime bounds, inclusive, in UTC. */
export function rangeVariables(range: DateRange) {
  return {
    startDate: range.from ? `${range.from}T00:00:00Z` : null,
    endDate: range.to ? `${range.to}T23:59:59Z` : null,
  };
}

export function useAuditLogData() {
  const [search, onSearchChange] = React.useState("");
  const [range, onRangeChange] = React.useState<DateRange>({
    from: "",
    to: "",
  });
  const settled = useDebounced(search);
  const logs = useQuery<AuditLogListData, AuditLogListVariables>(
    GET_AUDIT_LOGS,
    {
      variables: { search: orNull(settled), ...rangeVariables(range) },
    },
  );
  return {
    auditLogs: source(logs.data?.auditLogs, logs),
    search,
    onSearchChange,
    range,
    onRangeChange,
  };
}
