"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PoliciesConnected, type Panel } from "@/ui/screens/policies/connected";

export default function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; type?: string }>;
}) {
  const { panel, type } = use(searchParams);
  const router = useRouter();
  const open: Panel =
    panel === "simulate" || panel === "analyze" ? panel : null;
  return (
    <PoliciesConnected
      key={type ?? ""}
      capabilities={useCapabilities()}
      panel={open}
      onPanelChange={(next) => {
        const query = new URLSearchParams();
        if (type) query.set("type", type);
        if (next) query.set("panel", next);
        const search = query.toString();
        router.replace(search ? `/policies?${search}` : "/policies", {
          scroll: false,
        });
      }}
      initialType={type ?? ""}
    />
  );
}
