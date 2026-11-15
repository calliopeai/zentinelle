"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ProvidersConnected } from "@/ui/screens/models/connected";

export default function ProvidersPage() {
  return <ProvidersConnected capabilities={useCapabilities()} />;
}
