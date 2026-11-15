"use client";

import { use } from "react";

import { useCapability } from "@/components/PermissionGuard";
import { IncidentDetailConnected } from "@/ui/screens/activity/IncidentDetailConnected";

export default function IncidentCommentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <IncidentDetailConnected
      incidentId={decodeURIComponent(id)}
      tab="comments"
      canMutate={useCapability("mutate")}
    />
  );
}
