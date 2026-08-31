"use client";

import { use } from "react";

import { useContentViolations } from "@/graphql/content-scanner/hooks";
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

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive" as const;
    case "medium":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export default function AgentCompliancePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const { agent, loading: agentLoading } = useAgentBySlug(agentId);
  const { violations, loading } = useContentViolations(
    agent ? { endpointId: agent.id } : undefined,
  );

  if (agentLoading || loading) return <Skeleton className="h-64 w-full" />;
  if (!violations.length)
    return (
      <EmptyState message="No compliance violations recorded for this agent." />
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Rule</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Severity</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {violations.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
              {new Date(v.createdAt).toLocaleString()}
            </TableCell>
            <TableCell className="font-medium">{v.ruleName ?? "—"}</TableCell>
            <TableCell>{v.ruleTypeDisplay ?? v.ruleType}</TableCell>
            <TableCell>
              <Badge variant={severityVariant(v.severity)}>
                {v.severityDisplay ?? v.severity}
              </Badge>
            </TableCell>
            <TableCell>
              {v.wasBlocked
                ? "Blocked"
                : v.wasRedacted
                  ? "Redacted"
                  : "Logged"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
