"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { BudgetsConnected } from "@/ui/screens/models/connected";

export default function BudgetsPage() {
  return <BudgetsConnected capabilities={useCapabilities()} />;
}
