"use client";

import { use } from "react";

import { useInteractionLogs } from "@/graphql/interactions/hooks";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EmptyState } from "../empty-state";
import { useAgentBySlug } from "../use-agent";

export default function AgentInteractionsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { agent, loading: agentLoading } = useAgentBySlug(agentId);
  const { interactions, loading } = useInteractionLogs(
    agent ? { endpointId: agent.id } : undefined,
  );

  if (agentLoading || loading) return <Skeleton className="h-64 w-full" />;
  if (!interactions.length)
    return <EmptyState message="No interactions logged for this agent yet." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Tokens</TableHead>
          <TableHead className="text-right">Latency</TableHead>
          <TableHead>Flags</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {interactions.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
              {new Date(i.occurredAt).toLocaleString()}
            </TableCell>
            <TableCell>{i.aiProvider ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs">
              {i.aiModel ?? "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {(i.totalTokens ?? 0).toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {i.latencyMs != null ? `${i.latencyMs} ms` : "—"}
            </TableCell>
            <TableCell className="flex gap-1">
              {i.wasBlocked ? (
                <Badge variant="destructive">blocked</Badge>
              ) : null}
              {i.violationCount ? (
                <Badge variant="secondary">
                  {i.violationCount} violation
                  {i.violationCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
