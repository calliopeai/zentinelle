"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { ReportsConnected } from "@/ui/screens/risk/connected";

export default function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = use(searchParams);
  return (
    <ReportsConnected
      capabilities={useCapabilities()}
      view={type === "risk" || type === "compliance" ? type : "all"}
    />
  );
}
