import {
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenuItem,
  PageFrame,
  StatusBadge,
  StatusDot,
  type Column,
  type TabNavItem,
} from "@calliopelabs/ui";
import { BellIcon, CheckCheckIcon, InboxIcon } from "lucide-react";
import * as React from "react";

import type { ComplianceAlertData } from "@/graphql/alerts/types";
import type {
  NotificationData,
  NotificationStatus,
} from "@/graphql/notifications/types";

import { FilterSelect } from "../../shared/FilterSelect";
import { formatDateTime, humanize } from "../../shared/format";
import {
  useListController,
  type ListSource,
} from "../../shared/list-controller";
import { AlertDrawer, isAlertActive } from "./AlertDrawer";
import { activityCrumb } from "./nav";
import { notificationHref } from "./notification-href";
import {
  ALERT_SEVERITIES,
  ALERT_STATUS_TONE,
  ALERT_TYPES,
  SEVERITY_TONE,
  notificationTone,
  toneOf,
} from "./tones";

/** The three views of Alerts (ui-overhaul-ia §4.1): Mine is the person's notifications. */
export type AlertsView = "open" | "all" | "mine";

export interface AlertFilters {
  severity: string;
  alertType: string;
}

export const NO_ALERT_FILTERS: AlertFilters = { severity: "", alertType: "" };

export interface AlertsScreenProps {
  view: AlertsView;
  /** Operators and admins act on alerts; viewers read them. Everyone manages their own notifications. */
  canMutate: boolean;
  /** `ComplianceAlerts`, with `status: "open"` on the Open view. Read on Open and All. */
  alerts: ListSource<ComplianceAlertData>;
  filters: AlertFilters;
  onFiltersChange: (filters: AlertFilters) => void;
  onAcknowledge?: (alert: ComplianceAlertData) => void;
  /** Awaited; a rejection keeps the dialog open with its message. */
  onResolve?: (
    alert: ComplianceAlertData,
    notes: string,
  ) => Promise<unknown> | void;
  onDismiss?: (alert: ComplianceAlertData) => void;
  /** `Notifications`. Read on Mine. */
  notifications: ListSource<NotificationData>;
  notificationStatus: NotificationStatus | "";
  onNotificationStatusChange: (status: NotificationStatus | "") => void;
  /** From `UnreadNotifications`; shown on the Mine tab. Null while unknown. */
  unreadCount: number | null;
  onMarkRead?: (notification: NotificationData, read: boolean) => void;
  onMarkAllRead?: () => void;
}

const VIEWS: { key: AlertsView; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
];

function tabs(view: AlertsView, unread: number | null): TabNavItem[] {
  return VIEWS.map((v) => ({
    key: v.key,
    label: v.key === "mine" && unread ? `${v.label} (${unread})` : v.label,
    href: v.key === "open" ? "/alerts" : `/alerts?view=${v.key}`,
    active: v.key === view,
  }));
}

const ALERT_COLUMNS: Column<ComplianceAlertData>[] = [
  {
    id: "severity",
    header: "Severity",
    width: "w-28",
    cell: (a) => (
      <StatusBadge tone={toneOf(SEVERITY_TONE, a.severity)}>
        {a.severityDisplay ?? humanize(a.severity)}
      </StatusBadge>
    ),
  },
  {
    id: "alert",
    header: "Alert",
    cell: (a) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{a.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {a.alertTypeDisplay ?? humanize(a.alertType)}
        </span>
      </div>
    ),
  },
  {
    id: "agent",
    header: "Agent",
    width: "w-40",
    cell: (a) => (
      <span className="block truncate">{a.endpointName ?? "–"}</span>
    ),
  },
  {
    id: "violations",
    header: "Violations",
    width: "w-24",
    align: "right",
    cell: (a) => (
      <span className="font-mono tabular-nums">{a.violationCount ?? "–"}</span>
    ),
  },
  {
    id: "last",
    header: "Last seen",
    width: "w-44",
    cell: (a) => (
      <span className="font-mono text-xs">
        {formatDateTime(a.lastViolationAt ?? a.createdAt)}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-32",
    cell: (a) => (
      <StatusBadge tone={toneOf(ALERT_STATUS_TONE, a.status)}>
        {a.statusDisplay ?? humanize(a.status)}
      </StatusBadge>
    ),
  },
];

const NOTIFICATION_COLUMNS: Column<NotificationData>[] = [
  {
    id: "notification",
    header: "Notification",
    cell: (n) => (
      <div className="flex min-w-0 items-start gap-2">
        <StatusDot tone={notificationTone(n.type)} className="mt-1.5" />
        <div className="flex min-w-0 flex-col">
          <span
            className={
              n.status === "UNREAD" ? "truncate font-medium" : "truncate"
            }
          >
            {n.subject}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {humanize(n.type)}
            {n.message ? `: ${n.message}` : ""}
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "received",
    header: "Received",
    width: "w-44",
    cell: (n) => (
      <span className="font-mono text-xs">{formatDateTime(n.createdAt)}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    width: "w-24",
    cell: (n) => (
      <StatusBadge tone={n.status === "UNREAD" ? "info" : "muted"}>
        {n.status === "UNREAD" ? "unread" : "read"}
      </StatusBadge>
    ),
  },
];

function AlertsTable({
  view,
  canMutate,
  alerts,
  filters,
  onFiltersChange,
  onAcknowledge,
  onResolve,
  onDismiss,
}: Omit<
  AlertsScreenProps,
  | "notifications"
  | "notificationStatus"
  | "onNotificationStatusChange"
  | "unreadCount"
  | "onMarkRead"
  | "onMarkAllRead"
>) {
  const [open, setOpen] = React.useState<ComplianceAlertData | null>(null);
  const [resolving, setResolving] = React.useState<ComplianceAlertData | null>(
    null,
  );
  const isFiltered = Boolean(filters.severity || filters.alertType);
  const controller = useListController({
    ...alerts,
    isFiltered,
    clearFilters: () => onFiltersChange(NO_ALERT_FILTERS),
  });

  return (
    <>
      <DataTable
        label="Alerts"
        controller={controller}
        columns={ALERT_COLUMNS}
        getRowId={(a) => a.id}
        onRowActivate={setOpen}
        rowLabel={(a) => a.title}
        empty={
          view === "open"
            ? {
                icon: <BellIcon className="size-5" aria-hidden />,
                title: "No open alerts",
                description:
                  "Alerts open when an agent breaks a content rule or a policy threshold. Resolved and dismissed alerts are under All.",
                actionHref: "/alerts?view=all",
                actionLabel: "See all alerts",
              }
            : {
                icon: <BellIcon className="size-5" aria-hidden />,
                title: "No alerts yet",
                description:
                  "Alerts open when an agent breaks a content rule or a policy threshold.",
                actionHref: "/content-rules",
                actionLabel: "Review content rules",
              }
        }
        emptyFiltered={{
          title: "No alerts match these filters",
          description: "Clear the filters to see every alert in this view.",
        }}
        toolbar={
          <>
            <FilterSelect
              label="Severity"
              value={filters.severity}
              options={ALERT_SEVERITIES}
              onChange={(severity) => onFiltersChange({ ...filters, severity })}
            />
            <FilterSelect
              label="Type"
              value={filters.alertType}
              options={ALERT_TYPES}
              onChange={(alertType) =>
                onFiltersChange({ ...filters, alertType })
              }
            />
          </>
        }
        rowActions={
          canMutate
            ? (a) =>
                isAlertActive(a.status) ? (
                  <>
                    {a.status === "open" && (
                      <DropdownMenuItem onSelect={() => onAcknowledge?.(a)}>
                        Acknowledge
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setResolving(a)}>
                      Resolve…
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDismiss?.(a)}>
                      Dismiss
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled>No actions left</DropdownMenuItem>
                )
            : undefined
        }
      />
      <AlertDrawer
        alert={open}
        onClose={() => setOpen(null)}
        canMutate={canMutate}
        onAcknowledge={onAcknowledge}
        onDismiss={onDismiss}
        onResolve={(a) => {
          setOpen(null);
          setResolving(a);
        }}
      />
      <ConfirmDialog
        open={resolving !== null}
        onOpenChange={(o) => !o && setResolving(null)}
        title="Resolve this alert?"
        description={resolving?.title}
        confirmLabel="Resolve"
        reason={{
          label: "Resolution notes",
          placeholder: "What was done, for the audit log",
        }}
        onConfirm={(notes) => resolving && onResolve?.(resolving, notes)}
      />
    </>
  );
}

function MineTable({
  notifications,
  notificationStatus,
  onNotificationStatusChange,
  onMarkRead,
}: Pick<
  AlertsScreenProps,
  | "notifications"
  | "notificationStatus"
  | "onNotificationStatusChange"
  | "onMarkRead"
>) {
  const controller = useListController({
    ...notifications,
    isFiltered: notificationStatus !== "",
    clearFilters: () => onNotificationStatusChange(""),
  });
  return (
    <DataTable
      label="Your notifications"
      controller={controller}
      columns={NOTIFICATION_COLUMNS}
      getRowId={(n) => n.id}
      rowHref={notificationHref}
      rowLabel={(n) => n.subject}
      empty={{
        icon: <InboxIcon className="size-5" aria-hidden />,
        title: "Nothing for you",
        description:
          "Incidents assigned to you, budget warnings and risks that rise land here.",
      }}
      emptyFiltered={{
        title:
          notificationStatus === "UNREAD"
            ? "You have read everything"
            : "No notifications match",
        description: "Show every notification to see the rest.",
      }}
      toolbar={
        <FilterSelect
          label="Show"
          value={notificationStatus}
          allLabel="Every notification"
          options={[
            { value: "UNREAD", label: "Unread" },
            { value: "READ", label: "Read" },
          ]}
          onChange={(v) =>
            onNotificationStatusChange(v as NotificationStatus | "")
          }
        />
      }
      rowActions={(n) => (
        <DropdownMenuItem
          onSelect={() => onMarkRead?.(n, n.status === "UNREAD")}
        >
          {n.status === "UNREAD" ? "Mark read" : "Mark unread"}
        </DropdownMenuItem>
      )}
    />
  );
}

/**
 * Activity > Alerts: compliance alerts in Open and All, and the person's own
 * notifications in Mine, which replaces /notifications. Rows open the alert
 * in a side sheet; a notification row links to what it is about.
 */
export function AlertsScreen(props: AlertsScreenProps) {
  const { view, unreadCount, onMarkAllRead } = props;
  return (
    <PageFrame
      crumbs={[activityCrumb("alerts")]}
      title="Alerts"
      description={
        view === "mine"
          ? "Notifications for you: assignments, budget warnings and risks that rise."
          : "Content rule and policy violations, grouped into alerts."
      }
      primaryAction={
        view === "mine" && unreadCount ? (
          <Button variant="outline" size="sm" onClick={onMarkAllRead}>
            <CheckCheckIcon aria-hidden />
            Mark all read
          </Button>
        ) : undefined
      }
      tabs={tabs(view, unreadCount)}
      tabsLabel="Alert views"
    >
      {view === "mine" ? <MineTable {...props} /> : <AlertsTable {...props} />}
    </PageFrame>
  );
}
