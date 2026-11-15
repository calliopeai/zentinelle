"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PromptEditorConnected } from "@/ui/screens/policies/connected";

export default function NewPromptPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = use(searchParams);
  const router = useRouter();
  return (
    <PromptEditorConnected
      key={mode ?? "blank"}
      capabilities={useCapabilities()}
      mode={mode === "template" || mode === "guided" ? mode : "blank"}
      onNavigate={(href) => router.push(href)}
    />
  );
}
