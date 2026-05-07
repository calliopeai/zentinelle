"use client";

import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { useEndpoints } from "@/graphql/agents/hooks";
import type {
  EndpointData,
  SuspendAgentEndpointPayload,
  ActivateAgentEndpointPayload,
  DeleteAgentEndpointPayload,
} from "@/graphql/agents/types";
import {
  SUSPEND_AGENT_ENDPOINT,
  ACTIVATE_AGENT_ENDPOINT,
  DELETE_AGENT_ENDPOINT,
} from "@/graphql/agents/mutations";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";

function statusVariant(status: string) {
  switch (status) {
    case "active":
      return "default";
    case "suspended":
      return "destructive";
    case "inactive":
      return "secondary";
    default:
      return "outline";
  }
}

function healthVariant(health: string) {
  switch (health) {
    case "healthy":
      return "default";
    case "unhealthy":
      return "destructive";
    case "degraded":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTimestamp(ts: string | null) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

function ActionsCell({
  agent,
  onRefresh,
}: {
  agent: EndpointData;
  onRefresh: () => void;
}) {
  const confirm = useConfirm();
  const [suspendAgent] = useMutation<{ suspendAgentEndpoint: SuspendAgentEndpointPayload }>(SUSPEND_AGENT_ENDPOINT);
  const [activateAgent] = useMutation<{ activateAgentEndpoint: ActivateAgentEndpointPayload }>(ACTIVATE_AGENT_ENDPOINT);
  const [deleteAgent] = useMutation<{ deleteAgentEndpoint: DeleteAgentEndpointPayload }>(DELETE_AGENT_ENDPOINT);

  const handleSuspend = async () => {
    const ok = await confirm({
      title: "Suspend Agent",
      description: `Suspend "${agent.name}"? It will stop processing requests.`,
      confirmLabel: "Suspend",
    });
    if (!ok) return;
    try {
      const { data } = await suspendAgent({ variables: { id: agent.id } });
      if (data?.suspendAgentEndpoint?.success) {
        toast.success(`"${agent.name}" suspended`);
        onRefresh();
      } else {
        toast.error(data?.suspendAgentEndpoint?.error ?? "Failed to suspend");
      }
    } catch {
      toast.error("Failed to suspend agent");
    }
  };

  const handleActivate = async () => {
    try {
      const { data } = await activateAgent({ variables: { id: agent.id } });
      if (data?.activateAgentEndpoint?.success) {
        toast.success(`"${agent.name}" activated`);
        onRefresh();
      } else {
        toast.error(data?.activateAgentEndpoint?.error ?? "Failed to activate");
      }
    } catch {
      toast.error("Failed to activate agent");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Agent",
      description: `Permanently delete "${agent.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deleteAgent({ variables: { id: agent.id } });
      if (data?.deleteAgentEndpoint?.success) {
        toast.success(`"${agent.name}" deleted`);
        onRefresh();
      } else {
        toast.error(data?.deleteAgentEndpoint?.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete agent");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {agent.status === "active" ? (
          <DropdownMenuItem onClick={handleSuspend}>Suspend</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleActivate}>Activate</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AgentsPage() {
  const { endpoints, loading, refetch } = useEndpoints();

  const columns: ColumnDef<EndpointData, unknown>[] = [
    {
      accessorKey: "agentId",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Agent ID" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.agentId}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "agentType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.agentType}</Badge>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.status === filterValue;
      },
    },
    {
      accessorKey: "health",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Health" />
      ),
      cell: ({ row }) => (
        <Badge variant={healthVariant(row.original.health)}>
          {row.original.health}
        </Badge>
      ),
    },
    {
      accessorKey: "lastHeartbeat",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last Heartbeat" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatTimestamp(row.original.lastHeartbeat)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <ActionsCell agent={row.original} onRefresh={refetch} />
      ),
      enableSorting: false,
    },
  ];

  const filters: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "suspended", label: "Suspended" },
        { value: "inactive", label: "Inactive" },
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
        <h1 className="text-xl font-semibold">Agents</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage registered agent endpoints and their status
        </p>
      </div>
      <DataTable
        data={endpoints}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search agents..."
      />
    </div>
  );
}
