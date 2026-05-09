"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontalIcon,
  BotIcon,
  ActivityIcon,
  HeartPulseIcon,
  AlertTriangleIcon,
  CircleOffIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Pie, PieChart, Cell } from "recharts";
import { useEndpoints } from "@/graphql/agents/hooks";
import type {
  EndpointData,
  DeleteAgentEndpointPayload,
  UpdateEndpointStatusPayload,
} from "@/graphql/agents/types";
import {
  DELETE_AGENT_ENDPOINT,
  REGENERATE_ENDPOINT_API_KEY,
  UPDATE_ENDPOINT_STATUS,
} from "@/graphql/agents/mutations";
import { DataTable, DataTableColumnHeader, type FilterConfig } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/hooks/use-confirm";
import { RegisterAgentDialog } from "./register-agent-dialog";
import { EditAgentDialog } from "./edit-agent-dialog";
import { AssignGroupDialog } from "./assign-group-dialog";

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
  onEdit,
  onAssignGroup,
}: {
  agent: EndpointData;
  onRefresh: () => void;
  onEdit: (agent: EndpointData) => void;
  onAssignGroup: (agent: EndpointData) => void;
}) {
  const confirm = useConfirm();
  const [updateStatus] = useMutation<{ updateEndpointStatus: UpdateEndpointStatusPayload }>(UPDATE_ENDPOINT_STATUS);
  const [deleteAgent] = useMutation<{ deleteAgentEndpoint: DeleteAgentEndpointPayload }>(DELETE_AGENT_ENDPOINT);
  const [regenerateKey] = useMutation<{
    regenerateEndpointApiKey: { apiKey: string; success: boolean; error: string };
  }>(REGENERATE_ENDPOINT_API_KEY);

  const isActive = agent.status === "active";

  const handleToggleStatus = async () => {
    const nextStatus = isActive ? "suspended" : "active";
    if (isActive) {
      const ok = await confirm({
        title: "Suspend Agent",
        description: `Suspend "${agent.name}"? It will stop processing requests.`,
        confirmLabel: "Suspend",
      });
      if (!ok) return;
    }

    try {
      const { data } = await updateStatus({
        variables: { id: agent.id, status: nextStatus },
      });
      if (data?.updateEndpointStatus?.success) {
        toast.success(
          isActive ? `"${agent.name}" suspended` : `"${agent.name}" activated`
        );
        onRefresh();
      } else {
        toast.error(
          data?.updateEndpointStatus?.error ??
            (isActive ? "Failed to suspend" : "Failed to activate")
        );
      }
    } catch {
      toast.error(isActive ? "Failed to suspend agent" : "Failed to activate agent");
    }
  };

  const handleRegenerate = async () => {
    const ok = await confirm({
      title: "Regenerate API Key",
      description: `Generate a new API key for "${agent.name}". The old key will stop working immediately.`,
      confirmLabel: "Regenerate",
    });
    if (!ok) return;
    try {
      const { data } = await regenerateKey({
        variables: { endpointId: agent.id },
      });
      if (data?.regenerateEndpointApiKey?.success && data.regenerateEndpointApiKey.apiKey) {
        const newKey = data.regenerateEndpointApiKey.apiKey;
        await navigator.clipboard.writeText(newKey).catch(() => {});
        toast.success("New API key copied to clipboard", {
          description: `${newKey.slice(0, 16)}... — store it now, it won't be shown again`,
          duration: 15000,
        });
        onRefresh();
      } else {
        toast.error(data?.regenerateEndpointApiKey?.error ?? "Failed to regenerate");
      }
    } catch {
      toast.error("Failed to regenerate key");
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
        <DropdownMenuItem onClick={() => onEdit(agent)}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAssignGroup(agent)}>
          Assign to Group
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleToggleStatus}>
          {isActive ? "Suspend" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleRegenerate}>
          Regenerate API Key
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Agent Health Overview Components ─────────────────────────────── */

function HealthSummaryCards({ endpoints }: { endpoints: EndpointData[] }) {
  const total = endpoints.length;
  const active = endpoints.filter((e) => e.status === "active").length;
  const healthy = endpoints.filter((e) => e.health === "healthy").length;
  const degraded = endpoints.filter((e) => e.health === "degraded").length;
  const offline = endpoints.filter(
    (e) => e.status === "inactive" || e.status === "suspended"
  ).length;

  const pct = (n: number) =>
    total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

  const cards = [
    {
      label: "Total Agents",
      value: total,
      pctLabel: null,
      icon: BotIcon,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Active",
      value: active,
      pctLabel: pct(active),
      icon: ActivityIcon,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Healthy",
      value: healthy,
      pctLabel: pct(healthy),
      icon: HeartPulseIcon,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Degraded",
      value: degraded,
      pctLabel: pct(degraded),
      icon: AlertTriangleIcon,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Offline",
      value: offline,
      pctLabel: pct(offline),
      icon: CircleOffIcon,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(({ label, value, pctLabel, icon: Icon, color, bg }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              {label}
            </CardTitle>
            <div className={`${bg} rounded-md p-1.5`}>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{value}</p>
            {pctLabel && (
              <p className="text-muted-foreground mt-1 text-xs">
                {pctLabel} of total
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgentTypeDonut({ endpoints }: { endpoints: EndpointData[] }) {
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    endpoints.forEach((e) => {
      counts.set(e.agentType, (counts.get(e.agentType) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [endpoints]);

  const AGENT_TYPE_COLORS: Record<string, string> = {
    claude_code: "#37efed",
    codex: "#6366f1",
    gemini: "#f59e0b",
    langchain: "#10b981",
    langgraph: "#14b8a6",
    crewai: "#ec4899",
    mcp: "#8b5cf6",
    chat: "#3b82f6",
    custom: "#64748b",
    calliope: "#f97316",
  };
  const donutColors = typeCounts.map(
    (t) => AGENT_TYPE_COLORS[t.type] ?? "#64748b",
  );

  const config: ChartConfig = {};
  typeCounts.forEach((item, i) => {
    config[item.type] = {
      label: item.type,
      color: donutColors[i % donutColors.length],
    };
  });

  if (typeCounts.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No agents registered
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="type" />} />
        <Pie
          data={typeCounts}
          dataKey="count"
          nameKey="type"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
        >
          {typeCounts.map((entry, i) => (
            <Cell
              key={entry.type}
              fill={donutColors[i % donutColors.length]}
            />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="type" />} />
      </PieChart>
    </ChartContainer>
  );
}

function HealthStatusGrid({ endpoints }: { endpoints: EndpointData[] }) {
  function healthTileColor(health: string, status: string) {
    if (status === "inactive" || status === "suspended")
      return "bg-zinc-400/30 dark:bg-zinc-600/30";
    switch (health) {
      case "healthy":
        return "bg-emerald-500/40";
      case "degraded":
        return "bg-amber-500/40";
      case "unhealthy":
        return "bg-red-500/40";
      default:
        return "bg-zinc-400/30 dark:bg-zinc-600/30";
    }
  }

  if (endpoints.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No agents to display
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {endpoints.map((agent) => (
        <div
          key={agent.id}
          className={`flex h-8 min-w-[2rem] items-center justify-center rounded-md px-2 text-[10px] font-medium ${healthTileColor(
            agent.health,
            agent.status
          )}`}
          title={`${agent.name} - ${agent.health} (${agent.status})`}
        >
          <span className="max-w-[80px] truncate">
            {agent.agentId}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────── */

export default function AgentsPage() {
  const { endpoints, loading, refetch } = useEndpoints();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EndpointData | null>(null);
  const [assignTarget, setAssignTarget] = useState<EndpointData | null>(null);

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
      cell: ({ row }) => {
        const TYPE_COLORS: Record<string, string> = {
          claude_code: "#37efed", codex: "#6366f1", gemini: "#f59e0b",
          langchain: "#10b981", langgraph: "#14b8a6", crewai: "#ec4899",
          mcp: "#8b5cf6", chat: "#3b82f6", custom: "#64748b", calliope: "#f97316",
        };
        const color = TYPE_COLORS[row.original.agentType] ?? "#64748b";
        return (
          <Badge variant="outline" style={{ borderColor: color, color }}>
            {row.original.agentType}
          </Badge>
        );
      },
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
        <ActionsCell
          agent={row.original}
          onRefresh={refetch}
          onEdit={setEditTarget}
          onAssignGroup={setAssignTarget}
        />
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-7 rounded-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-1 h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[300px] w-full rounded-md" />
        <Skeleton className="h-[400px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage registered agent endpoints and their status
          </p>
        </div>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>
          <PlusIcon className="mr-1.5 h-4 w-4" />
          Register Agent
        </Button>
      </div>

      {/* Health summary cards */}
      <HealthSummaryCards endpoints={endpoints} />

      {/* Type distribution + health grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent Type Distribution</CardTitle>
            <CardDescription>Breakdown of registered agent types</CardDescription>
          </CardHeader>
          <CardContent>
            <AgentTypeDonut endpoints={endpoints} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health Status Grid</CardTitle>
            <CardDescription>
              <span className="mr-3">Per-agent health at a glance</span>
              <span className="inline-flex items-center gap-2 text-[11px]">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/60" /> healthy
                <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/60" /> degraded
                <span className="inline-block h-2 w-2 rounded-sm bg-red-500/60" /> unhealthy
                <span className="inline-block h-2 w-2 rounded-sm bg-zinc-400/40" /> offline
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HealthStatusGrid endpoints={endpoints} />
          </CardContent>
        </Card>
      </div>

      <div data-tour="agents-table">
      <DataTable
        data={endpoints}
        columns={columns}
        getRowId={(row) => row.id}
        filters={filters}
        searchPlaceholder="Search agents..."
      />
      </div>

      <RegisterAgentDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={refetch}
      />

      <EditAgentDialog
        agent={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onUpdated={refetch}
      />

      <AssignGroupDialog
        agent={assignTarget}
        open={assignTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null);
        }}
        onAssigned={refetch}
      />
    </div>
  );
}
