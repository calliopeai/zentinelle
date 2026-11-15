"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyDetailConnected } from "@/ui/screens/policies/connected";
import type { PolicyTab } from "@/ui/screens/policies/frame";

const TABS: readonly PolicyTab[] = [
  "overview",
  "configuration",
  "scope",
  "history",
];

export default function PolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = use(params);
  const { tab } = use(searchParams);
  const router = useRouter();
  return (
    <PolicyDetailConnected
      capabilities={useCapabilities()}
      id={decodeURIComponent(id)}
      tab={TABS.find((t) => t === tab) ?? "overview"}
      onNavigate={(href) => router.push(href)}
    />
  );
}
