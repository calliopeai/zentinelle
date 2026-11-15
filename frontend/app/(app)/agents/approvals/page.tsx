"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ApprovalsRoute } from "@/ui/screens/agents/ApprovalsRoute";

export default function ApprovalsPage() {
  return <ApprovalsRoute capabilities={useCapabilities()} />;
}
