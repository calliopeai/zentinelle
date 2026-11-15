"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyCopilotConnected } from "@/ui/screens/policies/connected";

export default function PolicyCopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ policy?: string }>;
}) {
  const { policy } = use(searchParams);
  return (
    <PolicyCopilotConnected
      capabilities={useCapabilities()}
      initialPolicyId={policy ?? ""}
    />
  );
}
