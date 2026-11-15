"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { RisksOverviewConnected } from "@/ui/screens/risk/connected";

export default function RisksOverviewPage() {
  return <RisksOverviewConnected capabilities={useCapabilities()} />;
}
