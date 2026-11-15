"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { CompareModelsConnected } from "@/ui/screens/models/connected";

export default function CompareModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = use(searchParams);
  const router = useRouter();
  return (
    <CompareModelsConnected
      capabilities={useCapabilities()}
      selectedIds={ids ? ids.split(",").filter(Boolean) : []}
      onSelectedChange={(next) =>
        router.replace(
          next.length
            ? `/models/compare?ids=${next.map(encodeURIComponent).join(",")}`
            : "/models/compare",
          { scroll: false },
        )
      }
    />
  );
}
