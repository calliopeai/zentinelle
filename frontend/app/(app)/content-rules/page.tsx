"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { ContentRulesConnected } from "@/ui/screens/policies/connected";

export default function ContentRulesPage() {
  return <ContentRulesConnected capabilities={useCapabilities()} />;
}
