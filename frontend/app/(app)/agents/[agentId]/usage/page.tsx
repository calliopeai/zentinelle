"use client";

import { use } from "react";

import { useUsageMetrics } from "@/graphql/usage/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { EmptyState } from "../empty-state";
import { useAgentBySlug } from "../use-agent";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AgentUsagePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { agent, loading: agentLoading } = useAgentBySlug(agentId);
  const { data, loading } = useUsageMetrics(
    agent ? { endpointId: agent.id } : undefined,
  );

  if (agentLoading || loading) return <Skeleton className="h-40 w-full" />;

  const summary = data?.usageMetrics?.summary;
  if (!summary)
    return <EmptyState message="No usage recorded for this agent yet." />;

  const cost = Number(summary.totalCost ?? 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Stat
        label="API calls (30d)"
        value={(summary.totalApiCalls ?? 0).toLocaleString()}
      />
      <Stat
        label="Tokens (30d)"
        value={(summary.totalTokens ?? 0).toLocaleString()}
      />
      <Stat
        label="Estimated cost (30d)"
        value={`$${cost.toFixed(2)}`}
      />
    </div>
  );
}
