/** `GetEndpoints` (graphql/agents/queries.ts), as the Agents list reads it. */
import { GET_ENDPOINTS } from "@/graphql/agents/queries";
import type {
  AgentGroup,
  EndpointData,
  EndpointListData,
} from "@/graphql/agents/types";

import { mockError, mockLoading, mockQuery } from "../graphql";

// The query selects five of AgentGroup's fields (ENDPOINT_FIELDS); the type
// in graphql/agents/types.ts is wider than the selection. A fixture holds
// only what the operation returns, or the cache drops the rest and the story
// shows data the route never would.
const SUPPORT_GROUP = {
  id: "grp-1",
  name: "Customer support",
  slug: "customer-support",
  color: "#37efed",
  tier: "standard",
} as Pick<AgentGroup, "id" | "name" | "slug" | "color" | "tier"> as AgentGroup;

function endpoint(
  overrides: Partial<EndpointData> & Pick<EndpointData, "id" | "name">,
): EndpointData {
  return {
    agentId: `agent-${overrides.id}`,
    agentType: "langgraph",
    description: "",
    status: "active",
    health: "healthy",
    capabilities: ["chat", "tools"],
    metadata: null,
    lastHeartbeat: "2026-10-16T14:05:00Z",
    apiKeyPrefix: "znt_live_7f3c",
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-10-16T14:05:00Z",
    deploymentName: "astrolift-prod",
    agentGroup: null,
    ...overrides,
  };
}

export const endpoints: EndpointListData = {
  endpoints: [
    endpoint({ id: "a-7f3c", name: "support-bot", agentGroup: SUPPORT_GROUP }),
    endpoint({ id: "a-1d9e", name: "triage-agent", agentGroup: SUPPORT_GROUP }),
    endpoint({
      id: "a-55b2",
      name: "nightly-sync",
      status: "offline",
      health: "unknown",
      lastHeartbeat: "2026-10-16T05:00:00Z",
    }),
    endpoint({
      id: "a-c041",
      name: "billing-reconcile",
      status: "suspended",
      health: "unhealthy",
      deploymentName: null,
    }),
  ],
};

export const agentsMocks = {
  full: [mockQuery(GET_ENDPOINTS, endpoints)],
  empty: [
    mockQuery(GET_ENDPOINTS, { endpoints: [] } satisfies EndpointListData),
  ],
  loading: [mockLoading(GET_ENDPOINTS)],
  error: [mockError(GET_ENDPOINTS)],
};
