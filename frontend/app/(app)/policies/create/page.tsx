"use client";

import { useRouter } from "next/navigation";
import { use, useState } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { PolicyEditorConnected } from "@/ui/screens/policies/connected";
import type { PolicySource } from "@/ui/screens/policies/PolicyEditorScreen";

export default function CreatePolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const query = use(searchParams);
  const router = useRouter();
  const [source, setSource] = useState<PolicySource>(
    query.source === "document" ? "document" : "blank",
  );
  return (
    <PolicyEditorConnected
      capabilities={useCapabilities()}
      source={source}
      onSourceChange={setSource}
      onNavigate={(href) => router.push(href)}
    />
  );
}
