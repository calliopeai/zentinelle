"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { RouteCheckConnected } from "@/ui/screens/models/connected";

export default function RouteCheckPage() {
  return <RouteCheckConnected capabilities={useCapabilities()} />;
}
