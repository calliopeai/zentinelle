"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { EffectivePolicyConnected } from "@/ui/screens/policies/connected";

export default function EffectivePolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ endpoint?: string; agent?: string }>;
}) {
  const { endpoint, agent } = use(searchParams);
  return (
    <EffectivePolicyConnected
      capabilities={useCapabilities()}
      initialAgent={endpoint ?? agent ?? ""}
    />
  );
}
