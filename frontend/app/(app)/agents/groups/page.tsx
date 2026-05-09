"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import { useAgentGroups } from "@/graphql/agent-groups/hooks";
import type {
  AgentGroupData,
  DeleteAgentGroupPayload,
} from "@/graphql/agent-groups/types";
import { DELETE_AGENT_GROUP } from "@/graphql/agent-groups/mutations";

import {
  DataTable,
  DataTableColumnHeader,
  type FilterConfig,
} from "@/components/data-table";
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

import { GroupDialog } from "./group-dialog";

const COLOR_SWATCH: Record<string, string> = {
  brand: "#37efed",
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  slate: "#64748b",
};

function tierVariant(tier: string) {
  switch (tier) {
    case "restricted":
      return "destructive";
    case "trusted":
      return "default";
    case "standard":
    default:
      return "secondary";
  }
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return "--";
  return new Date(ts).toLocaleDateString();
}

function ActionsCell({
  group,
  onRefresh,
  onEdit,
}: {
  group: AgentGroupData;
  onRefresh: () => void;
  onEdit: (group: AgentGroupData) => void;
}) {
  const confirm = useConfirm();
  const [deleteGroup] = useMutation<{
    deleteAgentGroup: DeleteAgentGroupPayload;
  }>(DELETE_AGENT_GROUP);

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Group",
      description:
        (group.agentCount ?? 0) > 0
          ? `"${group.name}" has ${group.agentCount} agent${
              group.agentCount === 1 ? "" : "s"
            } assigned. Deleting will unassign them. Continue?`
          : `Permanently delete "${group.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deleteGroup({ variables: { id: group.id } });
      if (data?.deleteAgentGroup?.success) {
        toast.success(`"${group.name}" deleted`);
        onRefresh();
      } else {
        toast.error(
          data?.deleteAgentGroup?.errors?.[0] ?? "Failed to delete group"
        );
      }
    } catch {
      toast.error("Failed to delete group");
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
        <DropdownMenuItem onClick={() => onEdit(group)}>Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AgentGroupsPage() {
  const { groups, loading, refetch } = useAgentGroups();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AgentGroupData | null>(null);

  const openCreate = () => {
    setEditGroup(null);
    setDialogOpen(true);
  };

  const openEdit = (group: AgentGroupData) => {
    setEditGroup(group);
    setDialogOpen(true);
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditGroup(null);
  };

  const columns: ColumnDef<AgentGroupData, unknown>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const swatch = COLOR_SWATCH[row.original.color] ?? "#64748b";
        return (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: swatch }}
              aria-hidden
            />
            <span className="font-medium">{row.original.name}</span>
          </span>
        );
      },
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Description" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground line-clamp-1 max-w-md text-sm">
          {row.original.description || (
            <span className="text-muted-foreground/60 italic">
              No description
            </span>
          )}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: "tier",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tier" />
      ),
      cell: ({ row }) => (
        <Badge variant={tierVariant(row.original.tier)}>
          {row.original.tier}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.tier === filterValue;
      },
    },
    {
      accessorKey: "agentCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Agents" />
      ),
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
          <UsersIcon className="text-muted-foreground h-3.5 w-3.5" />
          {row.original.agentCount ?? 0}
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
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <ActionsCell
          group={row.original}
          onRefresh={refetch}
          onEdit={openEdit}
        />
      ),
      enableSorting: false,
    },
  ];

  const filters: FilterConfig[] = [
    {
      id: "tier",
      label: "Tier",
      type: "select",
      options: [
        { value: "standard", label: "Standard" },
        { value: "restricted", label: "Restricted" },
        { value: "trusted", label: "Trusted" },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agent Groups</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Group agents by tier or role to apply shared posture defaults.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Create Group
        </Button>
      </div>

      <DataTable
        data={groups}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search groups..."
      />

      <GroupDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        onSaved={refetch}
        editGroup={editGroup}
      />
    </div>
  );
}
