"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { RetentionConnected } from "@/ui/screens/settings/connected";

export default function LegalHoldsPage() {
  return (
    <RetentionConnected capabilities={useCapabilities()} tab="legal-holds" />
  );
}
