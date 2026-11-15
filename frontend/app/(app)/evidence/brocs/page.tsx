"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { BrocsConnected } from "@/ui/screens/risk/connected";

export default function BrocsPage() {
  return <BrocsConnected capabilities={useCapabilities()} />;
}
