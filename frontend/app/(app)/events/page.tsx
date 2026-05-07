"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useEvents } from "@/graphql/events/hooks";
import type { EventData } from "@/graphql/events/types";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function categoryVariant(category: string) {
  switch (category) {
    case "audit":
      return "default";
    case "alert":
      return "destructive";
    case "telemetry":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString();
}

function ExpandablePayload({ payload }: { payload: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!payload || Object.keys(payload).length === 0) {
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
        {expanded ? "Hide" : "View"} payload
      </Button>
      {expanded && (
        <pre className="bg-muted mt-2 max-h-48 overflow-auto rounded-md p-2 text-xs">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function EventsPage() {
  const { events, loading } = useEvents();

  const columns: ColumnDef<EventData, unknown>[] = [
    {
      accessorKey: "eventType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Event Type" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.eventType}</span>
      ),
    },
    {
      accessorKey: "eventCategory",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => (
        <Badge variant={categoryVariant(row.original.eventCategory)}>
          {row.original.eventCategory}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.eventCategory === filterValue;
      },
    },
    {
      accessorKey: "endpointName",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Endpoint" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.endpointName ?? "--"}
        </span>
      ),
    },
    {
      accessorKey: "userIdentifier",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="User" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.userIdentifier ?? "--"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.status === "processed" ? "default" : "secondary"}>
          {row.original.status}
        </Badge>
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
      id: "payload",
      header: () => (
        <span className="flex h-8 items-center text-sm font-medium">Payload</span>
      ),
      cell: ({ row }) => <ExpandablePayload payload={row.original.payload} />,
      enableSorting: false,
    },
  ];

  const filters: FilterConfig[] = [
    {
      id: "eventCategory",
      label: "Category",
      type: "select",
      options: [
        { value: "telemetry", label: "Telemetry" },
        { value: "audit", label: "Audit" },
        { value: "alert", label: "Alert" },
      ],
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
        <h1 className="text-xl font-semibold">Events</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          View telemetry, audit, and alert events from your AI agents
        </p>
      </div>
      <DataTable
        data={events}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search events..."
      />
    </div>
  );
}
