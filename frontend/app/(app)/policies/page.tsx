"use client";

import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { usePolicies } from "@/graphql/policies/hooks";
import type {
  PolicyData,
  TogglePolicyEnabledPayload,
  DeletePolicyPayload,
} from "@/graphql/policies/types";
import {
  TOGGLE_POLICY_ENABLED,
  DELETE_POLICY,
} from "@/graphql/policies/mutations";
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

function enforcementVariant(enforcement: string) {
  switch (enforcement) {
    case "block":
      return "destructive";
    case "warn":
      return "secondary";
    case "log":
      return "outline";
    default:
      return "outline";
  }
}

function ActionsCell({
  policy,
  onRefresh,
}: {
  policy: PolicyData;
  onRefresh: () => void;
}) {
  const confirm = useConfirm();
  const [toggleEnabled] = useMutation<{ togglePolicyEnabled: TogglePolicyEnabledPayload }>(TOGGLE_POLICY_ENABLED);
  const [deletePolicy] = useMutation<{ deletePolicy: DeletePolicyPayload }>(DELETE_POLICY);

  const handleToggle = async () => {
    try {
      const { data } = await toggleEnabled({ variables: { id: policy.id } });
      if (data?.togglePolicyEnabled?.success) {
        toast.success(
          `"${policy.name}" ${policy.enabled ? "disabled" : "enabled"}`
        );
        onRefresh();
      } else {
        toast.error(data?.togglePolicyEnabled?.error ?? "Failed to toggle");
      }
    } catch {
      toast.error("Failed to toggle policy");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Policy",
      description: `Permanently delete "${policy.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deletePolicy({ variables: { id: policy.id } });
      if (data?.deletePolicy?.success) {
        toast.success(`"${policy.name}" deleted`);
        onRefresh();
      } else {
        toast.error(data?.deletePolicy?.error ?? "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete policy");
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
        <DropdownMenuItem onClick={handleToggle}>
          {policy.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function PoliciesPage() {
  const { policies, loading, refetch } = usePolicies();

  const columns: ColumnDef<PolicyData, unknown>[] = [
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
      accessorKey: "policyType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.policyType}</Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.policyType === filterValue;
      },
    },
    {
      accessorKey: "scopeType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Scope" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.scopeName ?? row.original.scopeType}
        </span>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.scopeType === filterValue;
      },
    },
    {
      accessorKey: "enforcement",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enforcement" />
      ),
      cell: ({ row }) => (
        <Badge variant={enforcementVariant(row.original.enforcement)}>
          {row.original.enforcement}
        </Badge>
      ),
    },
    {
      accessorKey: "enabled",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enabled" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.enabled ? "default" : "secondary"}>
          {row.original.enabled ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "priority",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Priority" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.priority}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <ActionsCell policy={row.original} onRefresh={refetch} />
      ),
      enableSorting: false,
    },
  ];

  const policyTypes = [...new Set(policies.map((p) => p.policyType))].sort();
  const scopeTypes = [...new Set(policies.map((p) => p.scopeType))].sort();

  const filters: FilterConfig[] = [
    {
      id: "policyType",
      label: "Policy Type",
      type: "select",
      options: policyTypes.map((t) => ({ value: t, label: t })),
    },
    {
      id: "scopeType",
      label: "Scope",
      type: "select",
      options: scopeTypes.map((s) => ({ value: s, label: s })),
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
        <h1 className="text-xl font-semibold">Policies</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Define and manage governance policies for your AI agents
        </p>
      </div>
      <DataTable
        data={policies}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search policies..."
      />
    </div>
  );
}
