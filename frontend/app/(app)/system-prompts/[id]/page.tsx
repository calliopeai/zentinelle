"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PromptEditorConnected } from "@/ui/screens/policies/connected";

export default function PromptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <PromptEditorConnected
      capabilities={useCapabilities()}
      mode="edit"
      id={decodeURIComponent(id)}
    />
  );
}
