"use client";

import { useCapability } from "@/components/PermissionGuard";
import { AssistantConnected } from "@/ui/screens/overview/AssistantConnected";

export default function AssistantPage() {
  return <AssistantConnected canMutate={useCapability("mutate")} />;
}
