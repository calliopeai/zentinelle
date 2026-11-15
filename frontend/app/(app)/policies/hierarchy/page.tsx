"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyHierarchyConnected } from "@/ui/screens/policies/connected";

export default function PolicyHierarchyPage() {
  return <PolicyHierarchyConnected capabilities={useCapabilities()} />;
}
