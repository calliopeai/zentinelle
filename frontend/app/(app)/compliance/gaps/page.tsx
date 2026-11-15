"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ComplianceGapsConnected } from "@/ui/screens/risk/connected";

export default function ComplianceGapsPage() {
  return <ComplianceGapsConnected capabilities={useCapabilities()} />;
}
