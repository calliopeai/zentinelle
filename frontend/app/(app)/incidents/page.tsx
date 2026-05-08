"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { useIncidents } from "@/graphql/risks/hooks";
import type { IncidentData } from "@/graphql/risks/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportIncidentDialog } from "./report-incident-dialog";

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

function formatTimestamp(ts: string | null) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

export default function IncidentsPage() {
  const { incidents, loading, refetch } = useIncidents();
  const [reportOpen, setReportOpen] = useState(false);

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
      cell: ({ row }) => (
        row.original.slaStatus ? (
          <Badge variant={slaVariant(row.original.slaStatus)}>
            {row.original.slaStatus}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">--</span>
        )
      ),
    },
    {
      accessorKey: "assignedToName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Assigned To" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.assignedToName ?? "--"}
        </span>
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
      />

      <ReportIncidentDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        onReported={refetch}
      />
    </div>
  );
}
