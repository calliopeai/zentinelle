"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { AgentsRoute } from "@/ui/screens/agents/AgentsRoute";

export default function AgentsPage() {
  return <AgentsRoute capabilities={useCapabilities()} />;
}
