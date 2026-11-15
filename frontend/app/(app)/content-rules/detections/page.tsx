"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { DetectionsConnected } from "@/ui/screens/policies/connected";

export default function DetectionsPage() {
  return <DetectionsConnected capabilities={useCapabilities()} />;
}
