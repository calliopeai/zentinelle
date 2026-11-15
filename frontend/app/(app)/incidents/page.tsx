"use client";

import { redirect } from "next/navigation";
import { use } from "react";

import { useCapability } from "@/components/PermissionGuard";
import { IncidentsConnected } from "@/ui/screens/activity/IncidentsConnected";

export default function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ incident?: string }>;
}) {
  const { incident } = use(searchParams);
  const canMutate = useCapability("mutate");
  // Links from before incidents had a page of their own: /incidents?incident=<id>.
  if (incident) redirect(`/incidents/${encodeURIComponent(incident)}`);
  return <IncidentsConnected canMutate={canMutate} />;
}
