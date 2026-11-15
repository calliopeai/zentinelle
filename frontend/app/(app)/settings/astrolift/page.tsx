"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { IntegrationsConnected } from "@/ui/screens/settings/connected";

export default function IntegrationsPage() {
  return <IntegrationsConnected capabilities={useCapabilities()} />;
}
