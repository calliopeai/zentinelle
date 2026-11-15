"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyChangesConnected } from "@/ui/screens/policies/connected";

export default function PolicyChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ change?: string }>;
}) {
  const { change } = use(searchParams);
  const router = useRouter();
  return (
    <PolicyChangesConnected
      capabilities={useCapabilities()}
      openId={change ?? null}
      onOpenChange={(id) =>
        router.replace(
          id
            ? `/policies/changes?change=${encodeURIComponent(id)}`
            : "/policies/changes",
          { scroll: false },
        )
      }
    />
  );
}
