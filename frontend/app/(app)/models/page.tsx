"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { ModelsConnected } from "@/ui/screens/models/connected";

export default function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ panel?: string; model?: string }>;
}) {
  const { panel, model } = use(searchParams);
  const router = useRouter();
  return (
    <ModelsConnected
      capabilities={useCapabilities()}
      estimate={panel === "estimate" ? { modelId: model } : null}
      onEstimate={(next) => {
        const query = new URLSearchParams();
        if (next) query.set("panel", "estimate");
        if (next?.modelId) query.set("model", next.modelId);
        const search = query.toString();
        router.replace(search ? `/models?${search}` : "/models", {
          scroll: false,
        });
      }}
    />
  );
}
