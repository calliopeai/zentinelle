"use client";

import { use } from "react";

import { useCapability } from "@/components/PermissionGuard";
import { AlertsConnected } from "@/ui/screens/activity/AlertsConnected";
import type { AlertsView } from "@/ui/screens/activity/AlertsScreen";

const VIEWS: readonly AlertsView[] = ["open", "all", "mine"];

export default function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = use(searchParams);
  return (
    <AlertsConnected
      view={VIEWS.find((v) => v === view) ?? "open"}
      canMutate={useCapability("mutate")}
    />
  );
}
