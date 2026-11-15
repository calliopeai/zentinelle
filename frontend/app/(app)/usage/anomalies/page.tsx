"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { AnomaliesConnected } from "@/ui/screens/models/connected";

export default function AnomaliesPage() {
  return <AnomaliesConnected capabilities={useCapabilities()} />;
}
