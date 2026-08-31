"use client";

import { useMemo } from "react";

import { useEndpoints } from "@/graphql/agents/hooks";
import type { EndpointData } from "@/graphql/agents/types";

/**
 * Resolve an Astrolift deeplink's agent_id (a slug) to the endpoint record.
 *
 * Astrolift constructs these URLs from the deployment slug alone, so the slug
 * is all we have. The list query is already tenant-scoped server side, so an
 * agent from another tenant simply is not in the result.
 */
export function useAgentBySlug(agentId: string) {
  const { endpoints, loading, error } = useEndpoints({ search: agentId });

  const agent = useMemo<EndpointData | null>(
    () => endpoints.find((e) => e.agentId === agentId) ?? null,
    [endpoints, agentId],
  );

  return { agent, loading, error, notFound: !loading && !error && !agent };
}
