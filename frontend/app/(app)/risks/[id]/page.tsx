"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { RiskDetailConnected } from "@/ui/screens/risk/connected";

export default function RiskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = use(params);
  const { edit } = use(searchParams);
  const router = useRouter();
  return (
    <RiskDetailConnected
      capabilities={useCapabilities()}
      id={decodeURIComponent(id)}
      editing={edit === "1"}
      onNavigate={(href) => router.push(href)}
    />
  );
}
