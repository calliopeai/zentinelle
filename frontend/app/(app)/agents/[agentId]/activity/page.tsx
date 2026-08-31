"use client";

import { use } from "react";

import { useEvents } from "@/graphql/events/hooks";
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

export default function AgentActivityPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { agent, loading: agentLoading } = useAgentBySlug(agentId);
  const { events, loading } = useEvents(
    agent ? { endpointId: agent.id } : undefined,
    { pollInterval: 10000 },
  );

  if (agentLoading || loading) return <Skeleton className="h-64 w-full" />;
  if (!events.length)
    return <EmptyState message="No events recorded for this agent yet." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
              {new Date(e.occurredAt).toLocaleString()}
            </TableCell>
            <TableCell className="font-medium">{e.eventType}</TableCell>
            <TableCell>
              <Badge variant="outline">{e.eventCategory}</Badge>
            </TableCell>
            <TableCell>{e.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
