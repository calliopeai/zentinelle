"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  CheckIcon,
  ShieldCheckIcon,
  XIcon,
  MoreHorizontalIcon,
  BellIcon,
} from "lucide-react";
import {
  useComplianceAlerts,
  useAcknowledgeComplianceAlert,
  useResolveComplianceAlert,
  useDismissComplianceAlert,
} from "@/graphql/alerts/hooks";
import type { ComplianceAlertData } from "@/graphql/alerts/types";
import {
  DataTable,
  DataTableColumnHeader,
  type FilterConfig,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Style helpers ───────────────────────────────────────────────────────────

function severityClasses(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400";
    case "high":
      return "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400";
    case "low":
      return "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusClasses(status: string): string {
  switch (status) {
    case "open":
      return "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400";
    case "acknowledged":
    case "investigating":
      return "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "resolved":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400";
    case "false_positive":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

function frameworkFromMetadata(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata) return null;
  const fw = metadata.framework;
  if (typeof fw === "string" && fw.length > 0) return fw;
  return null;
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-1 h-4 w-72" />
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

// ─── Resolve dialog ──────────────────────────────────────────────────────────

interface ResolveDialogProps {
  alert: ComplianceAlertData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}

function ResolveDialog({
  alert,
  open,
  onOpenChange,
  onResolved,
}: ResolveDialogProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolveAlert] = useResolveComplianceAlert();

  const handleSubmit = async () => {
    if (!alert) return;
    setSubmitting(true);
    try {
      const { data } = await resolveAlert({
        variables: { id: alert.id, notes: notes.trim() || null },
      });
      if (data?.resolveComplianceAlert?.success) {
        toast.success("Alert resolved");
        setNotes("");
        onOpenChange(false);
        onResolved();
      } else {
        toast.error("Failed to resolve alert");
      }
    } catch (err) {
      toast.error("Failed to resolve alert", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Resolve alert</DialogTitle>
          <DialogDescription>
            Mark this alert as resolved. Resolution notes are optional but
            recommended for the audit trail.
          </DialogDescription>
        </DialogHeader>
        {alert && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{alert.title}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {alert.severityDisplay ?? alert.severity} •{" "}
              {alert.alertTypeDisplay ?? alert.alertType}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="resolution-notes">Resolution notes</Label>
          <Textarea
            id="resolution-notes"
            placeholder="What was done to resolve this alert?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Resolving..." : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { alerts, loading, refetch } = useComplianceAlerts();
  const [acknowledgeAlert] = useAcknowledgeComplianceAlert();
  const [dismissAlert] = useDismissComplianceAlert();
  const [resolveTarget, setResolveTarget] =
    useState<ComplianceAlertData | null>(null);

  const handleAcknowledge = async (alert: ComplianceAlertData) => {
    try {
      const { data } = await acknowledgeAlert({ variables: { id: alert.id } });
      if (data?.acknowledgeComplianceAlert?.success) {
        toast.success("Alert acknowledged");
        refetch();
      } else {
        toast.error("Failed to acknowledge alert");
      }
    } catch (err) {
      toast.error("Failed to acknowledge alert", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleDismiss = async (alert: ComplianceAlertData) => {
    try {
      const { data } = await dismissAlert({ variables: { id: alert.id } });
      if (data?.dismissComplianceAlert?.success) {
        toast.success("Alert dismissed as false positive");
        refetch();
      } else {
        toast.error("Failed to dismiss alert");
      }
    } catch (err) {
      toast.error("Failed to dismiss alert", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const columns: ColumnDef<ComplianceAlertData, unknown>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.title}</span>
          {row.original.description && (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {row.original.description}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "severity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Severity" />
      ),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`capitalize ${severityClasses(row.original.severity)}`}
        >
          {row.original.severityDisplay ?? row.original.severity}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.severity === filterValue;
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
          className={`capitalize ${statusClasses(row.original.status)}`}
        >
          {row.original.statusDisplay ?? row.original.status.replace(/_/g, " ")}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      id: "framework",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Framework" />
      ),
      accessorFn: (row) => frameworkFromMetadata(row.metadata) ?? "",
      cell: ({ row }) => {
        const fw = frameworkFromMetadata(row.original.metadata);
        return fw ? (
          <Badge variant="outline" className="uppercase">
            {fw}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">--</span>
        );
      },
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return frameworkFromMetadata(row.original.metadata) === filterValue;
      },
    },
    {
      accessorKey: "endpointName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Agent" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.endpointName ?? "--"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.createdAt)}
        </span>
      ),
      sortingFn: (a, b) =>
        new Date(a.original.createdAt).getTime() -
        new Date(b.original.createdAt).getTime(),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const alert = row.original;
        const isOpen = alert.status === "open";
        const isTerminal =
          alert.status === "resolved" || alert.status === "false_positive";

        return (
          <div className="flex items-center justify-end gap-1">
            {isOpen && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => handleAcknowledge(alert)}
              >
                <CheckIcon className="mr-1 h-3.5 w-3.5" />
                Ack
              </Button>
            )}
            {!isTerminal && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={() => setResolveTarget(alert)}
              >
                <ShieldCheckIcon className="mr-1 h-3.5 w-3.5" />
                Resolve
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="More actions"
                >
                  <MoreHorizontalIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOpen && (
                  <DropdownMenuItem onClick={() => handleAcknowledge(alert)}>
                    <CheckIcon className="mr-2 h-4 w-4" />
                    Acknowledge
                  </DropdownMenuItem>
                )}
                {!isTerminal && (
                  <DropdownMenuItem onClick={() => setResolveTarget(alert)}>
                    <ShieldCheckIcon className="mr-2 h-4 w-4" />
                    Resolve
                  </DropdownMenuItem>
                )}
                {!isTerminal && <DropdownMenuSeparator />}
                {!isTerminal && (
                  <DropdownMenuItem
                    onClick={() => handleDismiss(alert)}
                    className="text-muted-foreground"
                  >
                    <XIcon className="mr-2 h-4 w-4" />
                    Dismiss as false positive
                  </DropdownMenuItem>
                )}
                {isTerminal && (
                  <DropdownMenuItem disabled>
                    No actions available
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  // Build filter options from current data
  const severities = [...new Set(alerts.map((a) => a.severity))]
    .filter(Boolean)
    .sort();
  const statuses = [...new Set(alerts.map((a) => a.status))]
    .filter(Boolean)
    .sort();
  const frameworks = [
    ...new Set(
      alerts
        .map((a) => frameworkFromMetadata(a.metadata))
        .filter((f): f is string => Boolean(f)),
    ),
  ].sort();

  const filters: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "select",
      options: statuses.map((s) => ({
        value: s,
        label: s.replace(/_/g, " "),
      })),
    },
    {
      id: "severity",
      label: "Severity",
      type: "select",
      options: severities.map((s) => ({ value: s, label: s })),
    },
    ...(frameworks.length > 0
      ? [
          {
            id: "framework",
            label: "Framework",
            type: "select" as const,
            options: frameworks.map((f) => ({
              value: f,
              label: f.toUpperCase(),
            })),
          },
        ]
      : []),
  ];

  // Stat counts
  const openCount = alerts.filter((a) => a.status === "open").length;
  const ackCount = alerts.filter(
    (a) => a.status === "acknowledged" || a.status === "investigating",
  ).length;
  const resolvedCount = alerts.filter((a) => a.status === "resolved").length;
  const criticalOpen = alerts.filter(
    (a) => a.status === "open" && a.severity === "critical",
  ).length;

  if (loading && alerts.length === 0) return <LoadingSkeleton />;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BellIcon className="h-5 w-5" />
            Alerts
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Triage compliance alerts: acknowledge, resolve, or dismiss as false
            positives.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-500">{openCount}</div>
            <div className="text-muted-foreground mt-1 text-sm">Open</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-amber-500">{ackCount}</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Acknowledged
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-emerald-500">
              {resolvedCount}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">Resolved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-600">
              {criticalOpen}
            </div>
            <div className="text-muted-foreground mt-1 text-sm">
              Critical &amp; Open
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        data={alerts}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search alerts..."
      />

      <ResolveDialog
        alert={resolveTarget}
        open={resolveTarget !== null}
        onOpenChange={(open) => !open && setResolveTarget(null)}
        onResolved={refetch}
      />
    </div>
  );
}
