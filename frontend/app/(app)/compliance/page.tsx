"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ComplianceConnected } from "@/ui/screens/risk/connected";

export default function CompliancePage() {
  return <ComplianceConnected capabilities={useCapabilities()} />;
}
