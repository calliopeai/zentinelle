"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { GroupsRoute } from "@/ui/screens/agents/GroupsRoute";

export default function GroupsPage() {
  return <GroupsRoute capabilities={useCapabilities()} />;
}
