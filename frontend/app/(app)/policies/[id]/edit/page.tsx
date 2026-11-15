"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyEditorConnected } from "@/ui/screens/policies/connected";
import type { PolicySource } from "@/ui/screens/policies/PolicyEditorScreen";

export default function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [source, setSource] = useState<PolicySource>("blank");
  return (
    <PolicyEditorConnected
      capabilities={useCapabilities()}
      id={decodeURIComponent(id)}
      source={source}
      onSourceChange={setSource}
      onNavigate={(href) => router.push(href)}
    />
  );
}
