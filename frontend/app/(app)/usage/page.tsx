"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { UsageOverviewConnected } from "@/ui/screens/models/connected";

export default function UsagePage() {
  return <UsageOverviewConnected capabilities={useCapabilities()} />;
}
