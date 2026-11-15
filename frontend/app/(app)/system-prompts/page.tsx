"use client";

import { useRouter } from "next/navigation";

import { useCapabilities } from "@/components/PermissionGuard";
import { PromptLibraryConnected } from "@/ui/screens/policies/connected";

export default function PromptLibraryPage() {
  const router = useRouter();
  return (
    <PromptLibraryConnected
      capabilities={useCapabilities()}
      onNavigate={(href) => router.push(href)}
    />
  );
}
