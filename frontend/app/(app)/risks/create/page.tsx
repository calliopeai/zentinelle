"use client";

import { useRouter } from "next/navigation";

import { useCapabilities } from "@/components/PermissionGuard";
import { RiskCreateConnected } from "@/ui/screens/risk/connected";

export default function NewRiskPage() {
  const router = useRouter();
  return (
    <RiskCreateConnected
      capabilities={useCapabilities()}
      onNavigate={(href) => router.push(href)}
    />
  );
}
