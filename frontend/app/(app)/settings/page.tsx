"use client";

import { use } from "react";

import { useCapabilities } from "@/components/PermissionGuard";
import { GeneralConnected } from "@/ui/screens/settings/connected";
import {
  GENERAL_TABS,
  type GeneralTab,
} from "@/ui/screens/settings/GeneralScreen";

export default function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = use(searchParams);
  const current: GeneralTab =
    GENERAL_TABS.find((t) => t.key === tab)?.key ?? "organization";
  return <GeneralConnected capabilities={useCapabilities()} tab={current} />;
}
