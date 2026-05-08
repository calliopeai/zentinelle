"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  useNotifications,
  useUnreadNotifications,
  useUpdateNotification,
  useMarkAllNotificationsRead,
} from "@/graphql/notifications/hooks";
import type {
  NotificationData,
  NotificationKind,
  NotificationSeverity,
} from "@/graphql/notifications/types";
import { cn } from "@/lib/utils";

const POPOVER_LIMIT = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a backend notification `type` to a UI severity bucket.
 * Notification model has no severity column — derived from type.
 */
export function severityForType(type: NotificationKind): NotificationSeverity {
  switch (type) {
    case "incident_opened":
    case "policy_violation":
      return "critical";
    case "high_risk":
    case "budget_warning":
      return "warning";
    default:
      return "info";
  }
}

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
};

const TYPE_LABEL: Record<string, string> = {
  policy_violation: "Policy Violation",
  budget_warning: "Budget Warning",
  high_risk: "High Risk",
  incident_opened: "Incident Opened",
};

export function typeLabel(type: NotificationKind): string {
  return TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

/**
 * Read a deep-link URL from the notification metadata.
 * Looks at the conventional `relatedUrl` key first, then falls back to a
 * resource-shaped (`incidentId`, `policyId`, ...) lookup.
 */
export function relatedUrlFor(
  n: Pick<NotificationData, "type" | "metadata">,
): string | null {
  const md = n.metadata as Record<string, unknown> | null;
  if (!md) return null;

  const direct = md.relatedUrl;
  if (typeof direct === "string" && direct.length > 0) return direct;

  const incidentId = md.incidentId ?? md.incident_id;
  if (typeof incidentId === "string" && incidentId)
    return `/incidents/${incidentId}`;

  const policyId = md.policyId ?? md.policy_id;
  if (typeof policyId === "string" && policyId) return `/policies/${policyId}`;

  const riskId = md.riskId ?? md.risk_id;
  if (typeof riskId === "string" && riskId) return `/risks/${riskId}`;

  // Sensible per-type fallbacks
  switch (n.type) {
    case "incident_opened":
      return "/incidents";
    case "budget_warning":
      return "/budget";
    case "policy_violation":
      return "/events";
    case "high_risk":
      return "/risks";
    default:
      return null;
  }
}

/**
 * Compact relative-time string ("2h ago", "now", "3d ago").
 * Pure formatter — no Intl.RelativeTimeFormat to keep bundle small.
 */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
}

// ─── Bell ────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  const { unreadCount, capped } = useUnreadNotifications({
    pollIntervalMs: 30_000,
  });

  // Only fetch the recent list when the popover opens — keeps the badge poll
  // light. cache-and-network so it stays fresh on reopen.
  const { notifications, loading, refetch } = useNotifications({
    first: POPOVER_LIMIT,
  });

  const [updateNotification] = useUpdateNotification();
  const [markAllRead, { loading: markingAll }] = useMarkAllNotificationsRead();

  React.useEffect(() => {
    if (open) {
      void refetch();
    }
  }, [open, refetch]);

  const handleClickItem = async (n: NotificationData) => {
    const target = relatedUrlFor(n);

    // Optimistic close — feels snappier than waiting on the mutation.
    setOpen(false);

    if (n.status === "UNREAD") {
      try {
        await updateNotification({
          variables: { id: n.id, status: "READ" },
        });
      } catch {
        // Soft-fail: navigation still happens, badge will reconcile on next poll.
      }
    }

    if (target) {
      router.push(target);
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

  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className={cn(
            "relative text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <BellIcon
            className={cn(
              "size-4",
              hasUnread && "animate-[pulse_2s_ease-in-out_infinite]",
            )}
          />
          {hasUnread && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-[1.1rem] font-semibold text-white shadow-sm ring-2 ring-background",
                unreadCount > 9 && "px-1.5",
              )}
            >
              {badgeText}
              {capped && unreadCount >= 50 ? "+" : ""}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <BellIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Notifications</span>
            {hasUnread && (
              <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                {badgeText} new
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasUnread || markingAll}
            onClick={handleMarkAll}
          >
            <CheckCheckIcon className="mr-1 size-3.5" />
            Mark all read
          </Button>
        </div>

        {/* List — scrollable area */}
        <div className="max-h-[24rem] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <ListSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y">
              {notifications.slice(0, POPOVER_LIMIT).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClickItem(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      n.status === "UNREAD" && "bg-muted/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 inline-block size-2 shrink-0 rounded-full",
                        SEVERITY_DOT[severityForType(n.type)],
                        n.status === "READ" && "opacity-40",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className={cn(
                            "truncate text-sm",
                            n.status === "UNREAD"
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/90",
                          )}
                        >
                          {n.subject}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.message}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded border border-border bg-background px-1 py-px text-[10px] capitalize text-muted-foreground">
                          {typeLabel(n.type)}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-2">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block w-full rounded-md py-1.5 text-center text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-10 text-center">
      <div className="rounded-full bg-muted p-3">
        <BellIcon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-3 text-sm font-medium">No notifications</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted-foreground">
        You&apos;re all caught up. New alerts and incidents will show up here.
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y">
      {Array.from({ length: 4 }).map((_, i) => (
        <li
          key={i}
          className="flex items-start gap-3 px-3 py-2.5"
          aria-hidden
        >
          <span className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted/70" />
            <div className="h-2 w-1/3 rounded bg-muted/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}
