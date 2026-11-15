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
import { useTranslations } from "next-intl";
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
  ALERT_STATUS_TONE,
  SEVERITY_TONE,
  notificationTone,
  toneOf,
  useActivityLabels,
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

const VIEWS: AlertsView[] = ["open", "all", "mine"];

type Translate = ReturnType<typeof useTranslations>;

function tabs(
  t: Translate,
  view: AlertsView,
  unread: number | null,
): TabNavItem[] {
  return VIEWS.map((key) => ({
    key,
    label:
      key === "mine" && unread
        ? t("views.mineUnread", { count: unread })
        : t(`views.${key}`),
    href: key === "open" ? "/alerts" : `/alerts?view=${key}`,
    active: key === view,
  }));
}

const alertColumns = (t: Translate): Column<ComplianceAlertData>[] => [
  {
    id: "severity",
    header: t("columns.severity"),
    width: "w-28",
    cell: (a) => (
      <StatusBadge tone={toneOf(SEVERITY_TONE, a.severity)}>
        {a.severityDisplay ?? humanize(a.severity)}
      </StatusBadge>
    ),
  },
  {
    id: "alert",
    header: t("columns.alert"),
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
    header: t("columns.agent"),
    width: "w-40",
    cell: (a) => (
      <span className="block truncate">{a.endpointName ?? "–"}</span>
    ),
  },
  {
    id: "violations",
    header: t("columns.violations"),
    width: "w-24",
    align: "right",
    cell: (a) => (
      <span className="font-mono tabular-nums">{a.violationCount ?? "–"}</span>
    ),
  },
  {
    id: "last",
    header: t("columns.last"),
    width: "w-44",
    cell: (a) => (
      <span className="font-mono text-xs">
        {formatDateTime(a.lastViolationAt ?? a.createdAt)}
      </span>
    ),
  },
  {
    id: "status",
    header: t("columns.status"),
    width: "w-32",
    cell: (a) => (
      <StatusBadge tone={toneOf(ALERT_STATUS_TONE, a.status)}>
        {a.statusDisplay ?? humanize(a.status)}
      </StatusBadge>
    ),
  },
];

const notificationColumns = (
  t: Translate,
  type: (value: string) => string,
): Column<NotificationData>[] => [
  {
    id: "notification",
    header: t("mine.columns.notification"),
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
            {type(n.type)}
            {n.message ? `: ${n.message}` : ""}
          </span>
        </div>
      </div>
    ),
  },
  {
    id: "received",
    header: t("mine.columns.received"),
    width: "w-44",
    cell: (n) => (
      <span className="font-mono text-xs">{formatDateTime(n.createdAt)}</span>
    ),
  },
  {
    id: "status",
    header: t("mine.columns.status"),
    width: "w-24",
    cell: (n) => (
      <StatusBadge tone={n.status === "UNREAD" ? "info" : "muted"}>
        {n.status === "UNREAD" ? t("mine.unread") : t("mine.read")}
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
  const t = useTranslations("activity.alerts");
  const labels = useActivityLabels();
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
        label={t("tableLabel")}
        controller={controller}
        columns={alertColumns(t)}
        getRowId={(a) => a.id}
        onRowActivate={setOpen}
        rowLabel={(a) => a.title}
        empty={
          view === "open"
            ? {
                icon: <BellIcon className="size-5" aria-hidden />,
                title: t("emptyOpen.title"),
                description: t("emptyOpen.description"),
                actionHref: "/alerts?view=all",
                actionLabel: t("emptyOpen.action"),
              }
            : {
                icon: <BellIcon className="size-5" aria-hidden />,
                title: t("emptyAll.title"),
                description: t("emptyAll.description"),
                actionHref: "/content-rules",
                actionLabel: t("emptyAll.action"),
              }
        }
        emptyFiltered={{
          title: t("emptyFiltered.title"),
          description: t("emptyFiltered.description"),
        }}
        toolbar={
          <>
            <FilterSelect
              label={t("filters.severity")}
              value={filters.severity}
              options={labels.alertSeverities}
              onChange={(severity) => onFiltersChange({ ...filters, severity })}
            />
            <FilterSelect
              label={t("filters.type")}
              value={filters.alertType}
              options={labels.alertTypes}
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
                        {t("acknowledge")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setResolving(a)}>
                      {t("resolveMenu")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDismiss?.(a)}>
                      {t("dismiss")}
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem disabled>{t("noActions")}</DropdownMenuItem>
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
        title={t("resolveDialog.title")}
        description={resolving?.title}
        confirmLabel={t("resolve")}
        reason={{
          label: t("resolveDialog.notes"),
          placeholder: t("resolveDialog.placeholder"),
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
  const t = useTranslations("activity.alerts");
  const controller = useListController({
    ...notifications,
    isFiltered: notificationStatus !== "",
    clearFilters: () => onNotificationStatusChange(""),
  });
  return (
    <DataTable
      label={t("mine.tableLabel")}
      controller={controller}
      columns={notificationColumns(t, humanize)}
      getRowId={(n) => n.id}
      rowHref={notificationHref}
      rowLabel={(n) => n.subject}
      empty={{
        icon: <InboxIcon className="size-5" aria-hidden />,
        title: t("mine.empty.title"),
        description: t("mine.empty.description"),
      }}
      emptyFiltered={{
        title:
          notificationStatus === "UNREAD"
            ? t("mine.emptyUnread")
            : t("mine.emptyFiltered.title"),
        description: t("mine.emptyFiltered.description"),
      }}
      toolbar={
        <FilterSelect
          label={t("mine.show")}
          value={notificationStatus}
          allLabel={t("mine.every")}
          options={[
            { value: "UNREAD", label: t("mine.unreadOption") },
            { value: "READ", label: t("mine.readOption") },
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
          {n.status === "UNREAD" ? t("mine.markRead") : t("mine.markUnread")}
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
  const t = useTranslations("activity.alerts");
  const { view, unreadCount, onMarkAllRead } = props;
  return (
    <PageFrame
      crumbs={[activityCrumb("alerts")]}
      title={t("title")}
      description={view === "mine" ? t("mineDescription") : t("description")}
      primaryAction={
        view === "mine" && unreadCount ? (
          <Button variant="outline" size="sm" onClick={onMarkAllRead}>
            <CheckCheckIcon aria-hidden />
            {t("markAllRead")}
          </Button>
        ) : undefined
      }
      tabs={tabs(t, view, unreadCount)}
      tabsLabel={t("tabsLabel")}
    >
      {view === "mine" ? <MineTable {...props} /> : <AlertsTable {...props} />}
    </PageFrame>
  );
}
