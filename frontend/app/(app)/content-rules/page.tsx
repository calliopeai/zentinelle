"use client";

import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { useContentRules } from "@/graphql/content-rules/hooks";
import type {
  ContentRuleData,
  ToggleContentRuleEnabledPayload,
  DeleteContentRulePayload,
} from "@/graphql/content-rules/types";
import {
  TOGGLE_CONTENT_RULE_ENABLED,
  DELETE_CONTENT_RULE,
  DUPLICATE_CONTENT_RULE,
} from "@/graphql/content-rules/mutations";
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

function enforcementVariant(enforcement: string) {
  switch (enforcement) {
    case "block":
      return "destructive";
    case "redact":
      return "destructive";
    case "warn":
      return "secondary";
    case "flag":
      return "secondary";
    case "log_only":
      return "outline";
    default:
      return "outline";
  }
}

function ActionsCell({
  rule,
  onRefresh,
}: {
  rule: ContentRuleData;
  onRefresh: () => void;
}) {
  const confirm = useConfirm();
  const [toggleEnabled] = useMutation<{ toggleContentRuleEnabled: ToggleContentRuleEnabledPayload }>(TOGGLE_CONTENT_RULE_ENABLED);
  const [deleteRule] = useMutation<{ deleteContentRule: DeleteContentRulePayload }>(DELETE_CONTENT_RULE);
  const [duplicateRule] = useMutation<{ duplicateContentRule: { success: boolean | null; ruleId: string | null; errors: string[] } }>(DUPLICATE_CONTENT_RULE);

  const handleToggle = async () => {
    try {
      const { data } = await toggleEnabled({
        variables: { id: rule.id, enabled: !rule.enabled },
      });
      if (data?.toggleContentRuleEnabled?.success) {
        toast.success(
          `"${rule.name}" ${rule.enabled ? "disabled" : "enabled"}`
        );
        onRefresh();
      }
    } catch {
      toast.error("Failed to toggle rule");
    }
  };

  const handleDuplicate = async () => {
    try {
      const { data } = await duplicateRule({
        variables: { id: rule.id },
      });
      if (data?.duplicateContentRule?.success) {
        toast.success(`"${rule.name}" duplicated`);
        onRefresh();
      } else {
        toast.error(
          data?.duplicateContentRule?.errors?.[0] ?? "Failed to duplicate"
        );
      }
    } catch {
      toast.error("Failed to duplicate rule");
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete Content Rule",
      description: `Permanently delete "${rule.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      const { data } = await deleteRule({ variables: { id: rule.id } });
      if (data?.deleteContentRule?.success) {
        toast.success(`"${rule.name}" deleted`);
        onRefresh();
      } else {
        toast.error(
          data?.deleteContentRule?.errors?.[0] ?? "Failed to delete"
        );
      }
    } catch {
      toast.error("Failed to delete rule");
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
          {rule.enabled ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDuplicate}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ContentRulesPage() {
  const { contentRules, loading, refetch } = useContentRules();

  const columns: ColumnDef<ContentRuleData, unknown>[] = [
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
      accessorKey: "ruleType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.ruleTypeDisplay ?? row.original.ruleType}
        </Badge>
      ),
      filterFn: (row, _, filterValue) => {
        if (!filterValue) return true;
        return row.original.ruleType === filterValue;
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
    },
    {
      accessorKey: "enforcement",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Enforcement" />
      ),
      cell: ({ row }) => (
        <Badge variant={enforcementVariant(row.original.enforcement)}>
          {row.original.enforcementDisplay ?? row.original.enforcement}
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
      accessorKey: "violationCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Violations" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.violationCount ?? 0}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <ActionsCell rule={row.original} onRefresh={refetch} />
      ),
      enableSorting: false,
    },
  ];

  const ruleTypes = [...new Set(contentRules.map((r) => r.ruleType))].sort();

  const filters: FilterConfig[] = [
    {
      id: "ruleType",
      label: "Rule Type",
      type: "select",
      options: ruleTypes.map((t) => ({ value: t, label: t })),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Content Rules</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure content scanning and filtering rules for AI inputs and outputs
        </p>
      </div>
      <DataTable
        data={contentRules}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search content rules..."
      />
    </div>
  );
}
