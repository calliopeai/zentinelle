"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { AtlasConnected } from "@/ui/screens/risk/connected";

export default function AtlasPage() {
  return <AtlasConnected capabilities={useCapabilities()} />;
}
