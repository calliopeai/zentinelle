"use client";

import { useCapabilities } from "@/components/PermissionGuard";
import { SettingsAssistantConnected } from "@/ui/screens/settings/connected";

export default function AssistantSettingsPage() {
  return <SettingsAssistantConnected capabilities={useCapabilities()} />;
}
