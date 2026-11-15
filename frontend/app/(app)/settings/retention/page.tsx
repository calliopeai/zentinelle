"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { RetentionConnected } from "@/ui/screens/settings/connected";

export default function RetentionPage() {
  return <RetentionConnected capabilities={useCapabilities()} tab="policies" />;
}
