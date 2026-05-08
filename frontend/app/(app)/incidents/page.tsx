"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { useIncidents } from "@/graphql/risks/hooks";
import { GET_INCIDENTS } from "@/graphql/risks/queries";
import {
  ACKNOWLEDGE_INCIDENT,
  RESOLVE_INCIDENT,
  CLOSE_INCIDENT,
} from "@/graphql/risks/mutations";
import type { IncidentData } from "@/graphql/risks/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReportIncidentDialog } from "./report-incident-dialog";
import { IncidentDetailDialog } from "./incident-detail-dialog";

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
      return "destructive";
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "outline";
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "open":
      return "destructive";
    case "acknowledged":
      return "secondary";
    case "investigating":
      return "secondary";
    case "resolved":
      return "default";
    case "closed":
      return "outline";
    default:
      return "outline";
  }
}

function slaVariant(sla: string | null) {
  switch (sla) {
    case "met":
      return "default";
    case "at_risk":
      return "secondary";
    case "breached":
      return "destructive";
    default:
      return "outline";
  }
}

function slaClassName(sla: string | null) {
  switch (sla) {
    case "met":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "at_risk":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "breached":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20";
    default:
      return "";
  }
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

export default function IncidentsPage() {
  const { incidents, loading, refetch } = useIncidents();
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<IncidentData | null>(
    null,
  );

  const [acknowledgeIncident] = useMutation(ACKNOWLEDGE_INCIDENT, {
    refetchQueries: [GET_INCIDENTS],
  });
  const [resolveIncident] = useMutation(RESOLVE_INCIDENT, {
    refetchQueries: [GET_INCIDENTS],
  });
  const [closeIncident] = useMutation(CLOSE_INCIDENT, {
    refetchQueries: [GET_INCIDENTS],
  });

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeIncident({ variables: { id } });
      toast.success("Incident acknowledged");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to acknowledge");
    }
  };

  const handleResolve = async (id: string) => {
    const resolution = window.prompt("Resolution summary:");
    if (!resolution?.trim()) return;
    try {
      await resolveIncident({
        variables: { id, resolution: resolution.trim() },
      });
      toast.success("Incident resolved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to resolve");
    }
  };

  const handleClose = async (id: string) => {
    const lessons = window.prompt("Lessons learned (optional):") ?? "";
    try {
      await closeIncident({
        variables: { id, lessonsLearned: lessons.trim() || null },
      });
      toast.success("Incident closed");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to close");
    }
  };

  const columns: ColumnDef<IncidentData, unknown>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "incidentType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.incidentTypeDisplay ?? row.original.incidentType}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.incidentType === filterValue;
      },
    },
    {
      accessorKey: "severity",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Severity" />
      ),
      cell: ({ row }) => (
        <Badge variant={severityVariant(row.original.severity)}>
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
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.statusDisplay ?? row.original.status}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      accessorKey: "slaStatus",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="SLA" />
      ),
      cell: ({ row }) =>
        row.original.slaStatus ? (
          <Badge
            variant={slaVariant(row.original.slaStatus)}
            className={slaClassName(row.original.slaStatus)}
          >
            {row.original.slaStatus.replace("_", " ")}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">--</span>
        ),
    },
    {
      accessorKey: "occurredAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Occurred At" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.occurredAt)}
        </span>
      ),
    },
    {
      accessorKey: "rootCause",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Root Cause" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground line-clamp-1 max-w-[240px] text-sm">
          {row.original.rootCause || "--"}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const incident = row.original;
        const isTerminal = ["closed", "resolved"].includes(incident.status);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              {incident.status === "open" && (
                <DropdownMenuItem
                  onClick={() => handleAcknowledge(incident.id)}
                >
                  Acknowledge
                </DropdownMenuItem>
              )}
              {!isTerminal && (
                <DropdownMenuItem onClick={() => handleResolve(incident.id)}>
                  Resolve
                </DropdownMenuItem>
              )}
              {incident.status === "resolved" && (
                <DropdownMenuItem onClick={() => handleClose(incident.id)}>
                  Close
                </DropdownMenuItem>
              )}
              {isTerminal && (
                <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      enableSorting: false,
    },
  ];

  const severities = [...new Set(incidents.map((i) => i.severity))].sort();
  const statuses = [...new Set(incidents.map((i) => i.status))].sort();
  const types = [...new Set(incidents.map((i) => i.incidentType))].sort();

  const filters: FilterConfig[] = [
    {
      id: "severity",
      label: "Severity",
      type: "select",
      options: severities.map((s) => ({ value: s, label: s })),
    },
    {
      id: "status",
      label: "Status",
      type: "select",
      options: statuses.map((s) => ({ value: s, label: s })),
    },
    {
      id: "incidentType",
      label: "Type",
      type: "select",
      options: types.map((t) => ({ value: t, label: t })),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track and manage security incidents and policy violations
          </p>
        </div>
        <Button size="sm" onClick={() => setReportOpen(true)}>
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Report Incident
        </Button>
      </div>
      <DataTable
        data={incidents}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search incidents..."
        onRowClick={(row) => setSelectedIncident(row)}
      />

      <ReportIncidentDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onReported={refetch}
      />

      <IncidentDetailDialog
        incident={selectedIncident}
        open={selectedIncident !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIncident(null);
        }}
      />
    </div>
  );
}
