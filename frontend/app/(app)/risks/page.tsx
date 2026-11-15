"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { RisksConnected } from "@/ui/screens/risk/connected";
import type { RegisterView } from "@/ui/screens/risk/RisksScreen";

const VIEWS: readonly RegisterView[] = ["list", "matrix", "rpn"];

export default function RisksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = use(searchParams);
  return (
    <RisksConnected
      capabilities={useCapabilities()}
      view={VIEWS.find((v) => v === view) ?? "list"}
    />
  );
}
