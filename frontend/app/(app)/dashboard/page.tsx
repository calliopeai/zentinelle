"use client";

import { useCapability } from "@/components/PermissionGuard";
import { OverviewConnected } from "@/ui/screens/overview/OverviewConnected";

export default function DashboardPage() {
  return <OverviewConnected canMutate={useCapability("mutate")} />;
}
