"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { AgentDetailRoute } from "@/ui/screens/agents/AgentDetailRoute";

export default function AgentUsagePage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  return (
    <AgentDetailRoute
      agentId={decodeURIComponent(agentId)}
      tab="usage"
      capabilities={useCapabilities()}
    />
  );
}
