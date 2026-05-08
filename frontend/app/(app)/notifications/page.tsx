"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  BellIcon,
  CheckCheckIcon,
  CheckIcon,
  ExternalLinkIcon,
  UndoIcon,
} from "lucide-react";

import {
  useNotifications,
  useUpdateNotification,
  useMarkAllNotificationsRead,
} from "@/graphql/notifications/hooks";
import type { NotificationData } from "@/graphql/notifications/types";
import {
  relatedUrlFor,
  severityForType,
  timeAgo,
  typeLabel,
} from "@/components/NotificationBell";

import {
  DataTable,
  DataTableColumnHeader,
  type FilterConfig,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─── Style helpers ───────────────────────────────────────────────────────────

function severityClasses(severity: "critical" | "warning" | "info"): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400";
    case "warning":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400";
    default:
      return "bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400";
  }
}

function statusClasses(status: string): string {
  return status === "UNREAD"
    ? "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400"
    : "bg-muted text-muted-foreground border-border";
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const { notifications, loading, refetch } = useNotifications({
    first: 200,
    status: unreadOnly ? "UNREAD" : null,
  });

  const [updateNotification] = useUpdateNotification();
  const [markAllRead, { loading: markingAll }] = useMarkAllNotificationsRead();

  const handleMarkRead = async (
    n: NotificationData,
    nextStatus: "READ" | "UNREAD",
  ) => {
    try {
      const { data } = await updateNotification({
        variables: { id: n.id, status: nextStatus },
      });
      const errors = data?.updateNotification?.errors ?? [];
      if (errors.length > 0) {
        toast.error("Failed to update notification", {
          description: errors[0],
        });
        return;
      }
      toast.success(
        nextStatus === "READ" ? "Marked as read" : "Marked as unread",
      );
      void refetch();
    } catch (err) {
      toast.error("Failed to update notification", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleOpen = async (n: NotificationData) => {
    const target = relatedUrlFor(n);
    if (n.status === "UNREAD") {
      try {
        await updateNotification({
          variables: { id: n.id, status: "READ" },
        });
      } catch {
        // Soft-fail — still navigate.
      }
    }
    if (target) {
      router.push(target);
    } else {
      void refetch();
    }
  };

  const handleMarkAll = async () => {
    try {
      const { data } = await markAllRead();
      const count = data?.markAllNotificationsRead?.count ?? 0;
      if (count > 0) {
        toast.success(
          count === 1
            ? "Marked 1 notification as read"
            : `Marked ${count} notifications as read`,
        );
      } else {
        toast.info("No unread notifications");
      }
      void refetch();
    } catch (err) {
      toast.error("Failed to mark all as read", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const columns: ColumnDef<NotificationData, unknown>[] = [
    {
      accessorKey: "subject",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Notification" />
      ),
      cell: ({ row }) => {
        const n = row.original;
        const isUnread = n.status === "UNREAD";
        return (
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-1.5 inline-block size-2 shrink-0 rounded-full",
                severityForType(n.type) === "critical" && "bg-red-500",
                severityForType(n.type) === "warning" && "bg-amber-500",
                severityForType(n.type) === "info" && "bg-sky-500",
                !isUnread && "opacity-40",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <div
                className={cn(
                  "truncate text-sm",
                  isUnread ? "font-semibold" : "font-medium",
                )}
              >
                {n.subject}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {n.message}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "severity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Severity" />
      ),
      accessorFn: (row) => severityForType(row.type),
      cell: ({ row }) => {
        const sev = severityForType(row.original.type);
        return (
          <Badge
            variant="outline"
            className={cn("capitalize", severityClasses(sev))}
          >
            {sev}
          </Badge>
        );
      },
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return severityForType(row.original.type) === filterValue;
      },
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {typeLabel(row.original.type)}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.type === filterValue;
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={cn("capitalize", statusClasses(row.original.status))}
        >
          {row.original.status.toLowerCase()}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Received" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{timeAgo(row.original.createdAt)}</span>
          <span className="text-[10px] text-muted-foreground">
            {formatTimestamp(row.original.createdAt)}
          </span>
        </div>
      ),
      sortingFn: (a, b) =>
        new Date(a.original.createdAt).getTime() -
        new Date(b.original.createdAt).getTime(),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const n = row.original;
        const isUnread = n.status === "UNREAD";
        const target = relatedUrlFor(n);
        return (
          <div className="flex items-center justify-end gap-1">
            {target && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => handleOpen(n)}
              >
                <ExternalLinkIcon className="mr-1 h-3.5 w-3.5" />
                Open
              </Button>
            )}
            {isUnread ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => handleMarkRead(n, "READ")}
              >
                <CheckIcon className="mr-1 h-3.5 w-3.5" />
                Read
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => handleMarkRead(n, "UNREAD")}
              >
                <UndoIcon className="mr-1 h-3.5 w-3.5" />
                Unread
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // Build filter options from current data.
  const types = [...new Set(notifications.map((n) => n.type))]
    .filter(Boolean)
    .sort();

  const filters: FilterConfig[] = [
    {
      id: "severity",
      label: "Severity",
      type: "select",
      options: [
        { value: "critical", label: "Critical" },
        { value: "warning", label: "Warning" },
        { value: "info", label: "Info" },
      ],
    },
    {
      id: "type",
      label: "Type",
      type: "select",
      options: types.map((t) => ({ value: t, label: typeLabel(t) })),
    },
    ...(unreadOnly
      ? []
      : [
          {
            id: "status",
            label: "Status",
            type: "select" as const,
            options: [
              { value: "UNREAD", label: "Unread" },
              { value: "READ", label: "Read" },
            ],
          },
        ]),
  ];

  // `now` lives in state and ticks every 60s — keeps the "Last 24h" count
  // accurate without calling `Date.now()` from render (React 19 purity rule).
  const [now, setNow] = React.useState<number>(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Stat counts (computed from the loaded list — `unreadOnly` mode hides reads,
  // so the totals reflect the current filter scope).
  const total = notifications.length;
  const unread = notifications.filter((n) => n.status === "UNREAD").length;
  const critical = notifications.filter(
    (n) => severityForType(n.type) === "critical",
  ).length;
  const last24h = notifications.filter(
    (n) => now - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000,
  ).length;

  if (loading && notifications.length === 0) return <LoadingSkeleton />;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BellIcon className="h-5 w-5" />
            Notifications
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            System alerts surfaced from policy violations, incidents, budget
            warnings and high-risk events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-background p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                !unreadOnly
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setUnreadOnly(true)}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                unreadOnly
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unread{!unreadOnly && unread > 0 ? ` (${unread})` : ""}
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={markingAll || (unreadOnly ? total === 0 : unread === 0)}
          >
            <CheckCheckIcon className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold">{total}</div>
            <div className="text-muted-foreground mt-1 text-sm">
              {unreadOnly ? "Unread" : "Total"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-500">{unread}</div>
            <div className="text-muted-foreground mt-1 text-sm">Unread</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-500">{critical}</div>
            <div className="text-muted-foreground mt-1 text-sm">Critical</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-amber-500">{last24h}</div>
            <div className="text-muted-foreground mt-1 text-sm">Last 24h</div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={notifications}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search notifications..."
      />
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6 text-center">
              <Skeleton className="mx-auto h-7 w-12" />
              <Skeleton className="mx-auto mt-2 h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-[400px] w-full rounded-md" />
    </div>
  );
}
