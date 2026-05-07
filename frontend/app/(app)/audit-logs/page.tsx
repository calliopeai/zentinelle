"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useAuditLogs } from "@/graphql/events/hooks";
import type { AuditLogData, AuditChange } from "@/graphql/events/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString();
}

function ExpandableChanges({ changes }: { changes: AuditChange[] | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!changes || changes.length === 0) {
    return <span className="text-muted-foreground text-xs">--</span>;
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-1 text-xs"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
        {changes.length} change{changes.length !== 1 ? "s" : ""}
      </Button>
      {expanded && (
        <div className="bg-muted mt-2 space-y-1 rounded-md p-2">
          {changes.map((change, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium">{change.field}:</span>{" "}
              <span className="text-red-600 line-through dark:text-red-400">
                {change.oldValue ?? "null"}
              </span>{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {change.newValue ?? "null"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { auditLogs, loading } = useAuditLogs();

  const columns: ColumnDef<AuditLogData, unknown>[] = [
    {
      accessorKey: "action",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Action" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.action}</Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.action === filterValue;
      },
    },
    {
      accessorKey: "resourceType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resource Type" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.resourceType}</span>
      ),
    },
    {
      accessorKey: "resourceName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Resource" />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.resourceName}</span>
      ),
    },
    {
      id: "actor",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Actor" />
      ),
      accessorFn: (row) => row.actor?.email ?? row.actor?.name ?? "--",
      cell: ({ row }) => {
        const actor = row.original.actor;
        return (
          <div className="text-sm">
            <span>{actor?.name ?? actor?.email ?? "--"}</span>
            {actor?.type && (
              <Badge variant="outline" className="ml-1.5">
                {actor.type}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Timestamp" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.timestamp)}
        </span>
      ),
    },
    {
      id: "changes",
      header: () => (
        <span className="flex h-8 items-center text-sm font-medium">Changes</span>
      ),
      cell: ({ row }) => <ExpandableChanges changes={row.original.changes} />,
      enableSorting: false,
    },
  ];

  const actionTypes = [...new Set(auditLogs.map((l) => l.action))].sort();

  const filters: FilterConfig[] = [
    {
      id: "action",
      label: "Action",
      type: "select",
      options: actionTypes.map((a) => ({ value: a, label: a })),
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
      <div>
        <h1 className="text-xl font-semibold">Audit Logs</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track all changes and actions performed in your organization
        </p>
      </div>
      <DataTable
        data={auditLogs}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search audit logs..."
      />
    </div>
  );
}
