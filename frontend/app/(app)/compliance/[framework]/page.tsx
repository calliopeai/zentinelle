"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { FrameworkDetailConnected } from "@/ui/screens/risk/connected";

export default function FrameworkPage({
  params,
}: {
  params: Promise<{ framework: string }>;
}) {
  const { framework } = use(params);
  const router = useRouter();
  return (
    <FrameworkDetailConnected
      capabilities={useCapabilities()}
      frameworkId={decodeURIComponent(framework)}
      onNavigate={(href) => router.push(href)}
    />
  );
}
