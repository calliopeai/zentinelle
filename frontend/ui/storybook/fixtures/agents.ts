/** The Agents area: every operation its screens read, as the operation returns it. */
import { GET_ENDPOINTS } from "@/graphql/agents/queries";
import type {
  AgentGroup,
  EndpointData,
  EndpointListData,
} from "@/graphql/agents/types";

import { GET_AGENT_GROUPS } from "@/graphql/agent-groups/queries";
import { CREATE_AGENT_GROUP } from "@/graphql/agent-groups/mutations";
import type {
  AgentGroupData,
  AgentGroupListData,
  CreateAgentGroupPayload,
} from "@/graphql/agent-groups/types";
import {
  CREATE_AGENT_ENDPOINT,
  SUSPEND_AGENT_ENDPOINT,
} from "@/graphql/agents/mutations";
import type {
  CreateAgentEndpointPayload,
  SuspendAgentEndpointPayload,
} from "@/graphql/agents/types";
import { GET_CONTENT_VIOLATIONS } from "@/graphql/content-scanner/queries";
import type {
  ContentViolationData,
  ContentViolationsData,
} from "@/graphql/content-scanner/types";
import { GET_EVENTS } from "@/graphql/events/queries";
import type { EventData, EventListData } from "@/graphql/events/types";
import { GET_INTERACTION_LOGS } from "@/graphql/interactions/queries";
import type {
  InteractionLogData,
  InteractionLogListData,
} from "@/graphql/interactions/types";
import { GET_USAGE_METRICS } from "@/graphql/usage/queries";
import type { UsageMetricsData } from "@/graphql/usage/types";
import type { HeldApproval } from "@/lib/approvals";

import { mockError, mockLoading, mockQuery } from "../graphql";
import type { AgentControlData } from "../../screens/agents/AgentControlsTab";
import type {
  EffectivePolicyRow,
  ToolPermissions,
} from "../../screens/agents/AgentPoliciesTab";
import { toAgentRow, type AgentRow } from "../../screens/agents/format";

// The query selects five of AgentGroup's fields (ENDPOINT_FIELDS); the type
// in graphql/agents/types.ts is wider than the selection. A fixture holds
// only what the operation returns, or the cache drops the rest and the story
// shows data the route never would.
const SUPPORT_GROUP = {
  id: "grp-1",
  name: "Customer support",
  slug: "customer-support",
  color: "brand",
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

/* ── The rest of the Agents area: one fixture per operation the screens read ── */

/** The moment the fixtures describe, so countdowns and times hold still in stories. */
export const NOW = Date.parse("2026-10-16T14:10:00Z");

const LONG =
  "customer-support-escalation-router-for-the-emea-enterprise-tier-with-a-very-long-name";

export const longEndpoints: EndpointListData = {
  endpoints: [
    endpoint({
      id: "a-long",
      name: "Customer support escalation router for the EMEA enterprise tier, second generation",
      agentId: LONG,
      agentType: "ms-agent-framework",
      deploymentName:
        "astrolift-prod-eu-west-1-enterprise-customer-support-escalations",
      agentGroup: {
        ...SUPPORT_GROUP,
        name: "Customer support, EMEA enterprise accounts under the regulated data tier",
      },
    }),
    ...endpoints.endpoints,
  ],
};

/** Thirty agents: more than a page, for the pager. */
export const manyEndpoints: EndpointListData = {
  endpoints: Array.from({ length: 30 }, (_, i) =>
    endpoint({
      id: `a-${String(i).padStart(3, "0")}`,
      name: `worker-${String(i + 1).padStart(2, "0")}`,
      status: i % 7 === 3 ? "suspended" : i % 5 === 4 ? "offline" : "active",
      health: i % 7 === 3 ? "degraded" : "healthy",
    }),
  ),
};

export const agentRows: AgentRow[] = endpoints.endpoints.map(toAgentRow);
export const longAgentRows: AgentRow[] =
  longEndpoints.endpoints.map(toAgentRow);

export const searchMocks = {
  /** GetEndpoints for one agent's page: the deeplink resolves `support-bot`'s slug. */
  supportBot: [
    mockQuery(GET_ENDPOINTS, {
      endpoints: [endpoints.endpoints[0]],
    } satisfies EndpointListData),
  ],
  long: [
    mockQuery(GET_ENDPOINTS, {
      endpoints: [longEndpoints.endpoints[0]],
    } satisfies EndpointListData),
  ],
};

/* GetAgentGroups selects every AgentGroup field. */
function group(
  overrides: Partial<AgentGroupData> & Pick<AgentGroupData, "id" | "name">,
): AgentGroupData {
  return {
    slug: overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: "",
    tier: "standard",
    color: "brand",
    createdAt: "2026-09-02T10:00:00Z",
    agentCount: 0,
    ...overrides,
  };
}

export const groups: AgentGroupListData = {
  agentGroups: [
    group({
      id: "grp-1",
      name: "Customer support",
      description: "Agents that answer customers in chat and email.",
      agentCount: 2,
    }),
    group({
      id: "grp-2",
      name: "Finance",
      tier: "restricted",
      color: "amber",
      description:
        "Reconciliation and billing agents with regulated data access.",
      agentCount: 1,
    }),
    group({
      id: "grp-3",
      name: "Internal tools",
      tier: "trusted",
      color: "indigo",
      agentCount: 5,
    }),
  ],
};

export const longGroups: AgentGroupListData = {
  agentGroups: [
    group({
      id: "grp-long",
      name: "Customer support, EMEA enterprise accounts under the regulated data tier",
      description:
        "Agents that answer enterprise customers in the EMEA region, under the regulated data tier, with escalation to a person for refunds over the approval threshold and for any request that names a contract.",
      tier: "restricted",
      color: "rose",
      agentCount: 12840,
    }),
    ...groups.agentGroups,
  ],
};

export const groupsMocks = {
  full: [mockQuery(GET_AGENT_GROUPS, groups)],
  empty: [
    mockQuery(GET_AGENT_GROUPS, {
      agentGroups: [],
    } satisfies AgentGroupListData),
  ],
  loading: [mockLoading(GET_AGENT_GROUPS)],
  error: [mockError(GET_AGENT_GROUPS)],
};

export const createGroupMocks = {
  ok: mockQuery(CREATE_AGENT_GROUP, {
    createAgentGroup: {
      group: group({ id: "grp-9", name: "Research" }),
      errors: [],
    } satisfies CreateAgentGroupPayload,
  }),
  refused: mockQuery(CREATE_AGENT_GROUP, {
    createAgentGroup: {
      group: null,
      errors: ["A group with this name already exists."],
    } satisfies CreateAgentGroupPayload,
  }),
};

export const agentMutationMocks = {
  suspended: mockQuery(SUSPEND_AGENT_ENDPOINT, {
    suspendAgentEndpoint: {
      endpoint: {
        id: "a-7f3c",
        status: "suspended",
      } as SuspendAgentEndpointPayload["endpoint"],
      success: true,
      error: null,
    } satisfies SuspendAgentEndpointPayload,
  }),
  suspendRefused: mockQuery(SUSPEND_AGENT_ENDPOINT, {
    suspendAgentEndpoint: {
      endpoint: null,
      success: false,
      error:
        "Agents deployed from Astrolift AI are suspended from Astrolift AI.",
    } satisfies SuspendAgentEndpointPayload,
  }),
  registered: mockQuery(CREATE_AGENT_ENDPOINT, {
    createAgentEndpoint: {
      endpoint: {
        id: "a-new1",
        agentId: "research-bot",
        agentType: "langgraph",
        name: "research-bot",
        status: "active",
        apiKeyPrefix: "znt_live_91ab",
        createdAt: "2026-10-16T14:10:00Z",
      } as CreateAgentEndpointPayload["endpoint"],
      apiKey: "znt_live_91ab4c2e7d0f6a3b8e5c1d9f2a7b4e6c",
      success: true,
      error: null,
    } satisfies CreateAgentEndpointPayload,
  }),
};

/* GetEvents selects every EventData field. */
function event(i: number, overrides: Partial<EventData> = {}): EventData {
  return {
    id: `evt-${i}`,
    eventType: "tool_call",
    eventCategory: "telemetry",
    status: "processed",
    payload: null,
    userIdentifier: "dana@example.com",
    occurredAt: new Date(NOW - i * 7 * 60_000).toISOString(),
    processedAt: new Date(NOW - i * 7 * 60_000 + 800).toISOString(),
    correlationId: `corr-${i}`,
    endpointName: "support-bot",
    ...overrides,
  };
}

export const events: EventListData = {
  events: [
    event(0),
    event(1, { eventType: "policy_violation", eventCategory: "audit" }),
    event(2, { eventType: "heartbeat", userIdentifier: null }),
    event(3, { eventType: "tool_call", status: "failed" }),
    event(4, { eventType: "model_request", status: "pending" }),
  ],
};

export const longEvents: EventListData = {
  events: [
    event(0, {
      eventType: "agent_host_delegated_tool_call_with_retained_arguments",
      userIdentifier:
        "a.very.long.service.account.name@automation.enterprise-customer.example.com",
    }),
    ...events.events,
  ],
};

/* GetInteractionLogs selects every InteractionLogData field. */
function interaction(
  i: number,
  overrides: Partial<InteractionLogData> = {},
): InteractionLogData {
  return {
    id: `int-${i}`,
    interactionType: "chat",
    interactionTypeDisplay: "Chat",
    aiProvider: "anthropic",
    aiModel: "claude-sonnet-4-5",
    inputTokenCount: 1200,
    outputTokenCount: 340,
    totalTokens: 1540,
    estimatedCostUsd: "0.0094",
    latencyMs: 1830,
    userIdentifier: "dana@example.com",
    endpointName: "support-bot",
    hasViolations: false,
    violationCount: 0,
    wasBlocked: false,
    occurredAt: new Date(NOW - i * 11 * 60_000).toISOString(),
    ...overrides,
  };
}

export const interactions: InteractionLogListData = {
  interactionLogs: [
    interaction(0),
    interaction(1, { hasViolations: true, violationCount: 2 }),
    interaction(2, {
      wasBlocked: true,
      hasViolations: true,
      violationCount: 1,
    }),
    interaction(3, { aiProvider: "openai", aiModel: "gpt-5", latencyMs: null }),
  ],
};

export const longInteractions: InteractionLogListData = {
  interactionLogs: [
    interaction(0, {
      aiModel:
        "us.anthropic.claude-sonnet-4-5-20250929-v1:0-provisioned-throughput-eu-west",
      totalTokens: 1_284_022_310,
      estimatedCostUsd: "48211.73",
      latencyMs: 182_340,
      userIdentifier:
        "a.very.long.service.account.name@automation.enterprise-customer.example.com",
    }),
    ...interactions.interactionLogs,
  ],
};

export const usage: UsageMetricsData = {
  usageMetrics: {
    summary: {
      totalApiCalls: 18240,
      totalTokens: 41_822_310,
      totalCost: 312.48,
      activeAgents: 1,
      storageUsedMb: 12,
    },
    timeSeries: [],
    byAgent: [],
    byEndpoint: [],
  },
};

export const noUsage: UsageMetricsData = {
  usageMetrics: {
    summary: {
      totalApiCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      activeAgents: 0,
      storageUsedMb: 0,
    },
    timeSeries: [],
    byAgent: [],
    byEndpoint: [],
  },
};

/* GetContentViolations selects every ContentViolationData field. */
function violation(
  i: number,
  overrides: Partial<ContentViolationData> = {},
): ContentViolationData {
  return {
    id: `vio-${i}`,
    ruleType: "pii_detection",
    ruleTypeDisplay: "PII detection",
    severity: "high",
    severityDisplay: "High",
    enforcement: "block",
    matchedPattern: null,
    matchedText: null,
    matchStart: null,
    matchEnd: null,
    confidence: 0.97,
    category: "pii",
    wasBlocked: true,
    wasRedacted: false,
    userNotified: true,
    adminNotified: true,
    createdAt: new Date(NOW - i * 23 * 60_000).toISOString(),
    ruleName: "Card numbers",
    ...overrides,
  };
}

export const violations: ContentViolationsData = {
  contentViolations: [
    violation(0),
    violation(1, {
      ruleType: "prompt_injection",
      ruleTypeDisplay: "Prompt injection",
      severity: "critical",
      severityDisplay: "Critical",
      ruleName: "Jailbreak phrases",
    }),
    violation(2, {
      severity: "medium",
      severityDisplay: "Medium",
      wasBlocked: false,
      wasRedacted: true,
      ruleName: "Email addresses",
    }),
    violation(3, {
      severity: "low",
      severityDisplay: "Low",
      wasBlocked: false,
      ruleName: null,
    }),
  ],
};

export const detailMocks = {
  full: [
    ...searchMocks.supportBot,
    mockQuery(GET_EVENTS, events),
    mockQuery(GET_INTERACTION_LOGS, interactions),
    mockQuery(GET_USAGE_METRICS, usage),
    mockQuery(GET_CONTENT_VIOLATIONS, violations),
  ],
  empty: [
    ...searchMocks.supportBot,
    mockQuery(GET_EVENTS, { events: [] } satisfies EventListData),
    mockQuery(GET_INTERACTION_LOGS, {
      interactionLogs: [],
    } satisfies InteractionLogListData),
    mockQuery(GET_USAGE_METRICS, noUsage),
    mockQuery(GET_CONTENT_VIOLATIONS, {
      contentViolations: [],
    } satisfies ContentViolationsData),
  ],
  notFound: [
    mockQuery(GET_ENDPOINTS, { endpoints: [] } satisfies EndpointListData),
  ],
  loading: [mockLoading(GET_ENDPOINTS)],
  error: [mockError(GET_ENDPOINTS)],
  tabLoading: [
    ...searchMocks.supportBot,
    mockLoading(GET_EVENTS),
    mockLoading(GET_INTERACTION_LOGS),
    mockLoading(GET_USAGE_METRICS),
    mockLoading(GET_CONTENT_VIOLATIONS),
  ],
  tabError: [
    ...searchMocks.supportBot,
    mockError(GET_EVENTS),
    mockError(GET_INTERACTION_LOGS),
    mockError(GET_USAGE_METRICS),
    mockError(GET_CONTENT_VIOLATIONS),
  ],
};

/* GET /agents/{agent_id}/control (REST), as AgentControlView answers it. */
export const control: AgentControlData = {
  agent: {
    tools: ["search_kb", "create_ticket", "refund_order"],
    model_routes: ["anthropic/claude-sonnet-4-5", "openai/gpt-5-mini"],
    data_access: ["crm:read", "orders:read"],
    authority: ["authority:write", "data:confidential"],
    budget: { monthly_usd: 500, alert_at_percent: 80 },
    containment: { denied_tools: ["refund_order"] },
  },
  policies: [
    {
      id: "pol-1",
      name: "Support budget",
      type: "budget_limit",
      version: 3,
      enforcement: "enforce",
    },
  ],
  incidents: [
    {
      id: "inc-1",
      status: "investigating",
      severity: "high",
      title: "Refund issued above threshold",
    },
  ],
  decision_traces: [
    {
      trace_id: "tr_7f3c2a91e4",
      action: "update",
      timestamp: "2026-10-16T13:58:00Z",
    },
  ],
};

export const emptyControl: AgentControlData = {
  agent: {
    tools: [],
    model_routes: [],
    data_access: [],
    authority: [],
    budget: {},
  },
  policies: [],
  incidents: [],
  decision_traces: [],
};

/* GET /effective-policy?endpoint= (REST), the fields the tab reads. */
export const effectivePolicies: EffectivePolicyRow[] = [
  {
    id: "pol-org",
    name: "Organization guardrails",
    type: "ai_guardrails",
    scope: "organization",
    priority: 10,
    enforcement: "enforce",
  },
  {
    id: "pol-grp",
    name: "Support tool permissions",
    type: "tool_permission",
    scope: "sub_organization",
    priority: 20,
    enforcement: "enforce",
  },
  {
    id: "pol-1",
    name: "Support budget",
    type: "budget_limit",
    scope: "endpoint",
    priority: 30,
    enforcement: "audit",
  },
];

export const toolPermissions: ToolPermissions = {
  allowed: ["search_kb", "create_ticket"],
  denied: ["delete_customer"],
  requires_approval: ["refund_order"],
};

/* GET /approvals/requests (REST): held agent-host calls, at fixed times before and after NOW. */
function held(
  i: number,
  overrides: Partial<HeldApproval> = {},
  at = NOW,
): HeldApproval {
  return {
    request_id: `0b6f${i}c2e-7d0f-4a3b-8e5c-1d9f2a7b4e6${i}`,
    agent_id: "support-bot",
    user_id: "dana@example.com",
    action: "tool_call",
    context: {
      tool_name: "refund_order",
      harness: "claude_code",
      session_id: `sess-${i}`,
      run_id: `run-${i}`,
      tool_input: { order_id: `A-${1040 + i}`, amount_usd: 240 + i * 10 },
    },
    reason: "Refunds over $200 need a person (Support tool permissions).",
    trace_id: `tr_${i}a91e4`,
    expires_at: new Date(at + (10 - i * 4) * 60_000).toISOString(),
    created_at: new Date(at - i * 3 * 60_000).toISOString(),
    ...overrides,
  };
}

export function heldRequests(at = NOW): HeldApproval[] {
  return [
    held(0, {}, at),
    held(
      1,
      {
        agent_id: "triage-agent",
        user_id: null,
        action: "delegate",
        context: {
          harness: "codex",
          agents: ["research-bot"],
          estimated_cost_usd: 1.4,
        },
        reason: "",
      },
      at,
    ),
    held(2, { expires_at: new Date(at - 30_000).toISOString() }, at),
  ];
}

export const longRequest: HeldApproval = held(0, {
  agent_id: LONG,
  user_id:
    "a.very.long.service.account.name@automation.enterprise-customer.example.com",
  context: {
    tool_name:
      "bulk_update_customer_records_across_every_region_and_every_tier",
    harness: "ms-agent-framework",
    session_id: "sess-6f1e0c4b9a8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f",
    paths: [
      "/srv/data/customers/emea/enterprise/2026/10/16/export-0001.parquet",
    ],
    tool_input: {
      filter: { region: "emea", tier: "enterprise" },
      update: { contact_owner: "new-owner@example.com" },
      note: "x".repeat(400),
    },
  },
  reason:
    "Bulk writes to customer records need a person when they touch more than 100 rows or any regulated field, under the organization's data handling policy and the EMEA processing addendum.",
});
