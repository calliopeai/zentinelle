"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { EvidenceCoverageConnected } from "@/ui/screens/risk/connected";

export default function EvidencePage() {
  return <EvidenceCoverageConnected capabilities={useCapabilities()} />;
}
