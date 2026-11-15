"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ApiKeysConnected } from "@/ui/screens/settings/connected";

export default function ApiKeysPage() {
  return <ApiKeysConnected capabilities={useCapabilities()} />;
}
