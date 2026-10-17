/**
 * Models & usage: `GetUsageMetrics` (graphql/usage/queries.ts) and
 * `AiModels` (graphql/models/queries.ts), the operations the area's routes
 * send, plus the REST answers the area reads (budget showback, route checks,
 * provider keys), in the shapes the current pages parse.
 */
import type { AIModelData } from "@/graphql/models/hooks";
import { GET_AI_MODELS } from "@/graphql/models/queries";
import { GET_USAGE_METRICS } from "@/graphql/usage/queries";
import type { UsageMetricsData } from "@/graphql/usage/types";

import type { ShowbackReport } from "../../screens/models/budgets";
import type {
  CanaryResult,
  ProviderModel,
  StoredProviderKey,
} from "../../screens/models/providers";
import { mockError, mockLoading, mockQuery } from "../graphql";

/** The day the fixtures end on, so every story renders the same. */
export const FIXTURE_END = "2026-10-16T00:00:00.000Z";

const DAY_MS = 86_400_000;

function day(i: number, of: number) {
  return new Date(Date.parse(FIXTURE_END) - (of - 1 - i) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// 30 days of steady, weekly-shaped traffic with one spike (Oct 9) the
// detector should mark, and nothing else.
const WEEK = [300, 340, 310, 335, 305, 330, 315];
const TOKENS = [
  ...Array.from({ length: 30 }, (_, i) => (i === 22 ? 910 : WEEK[i % 7])),
].map((k) => k * 1000);

const AGENTS: [string, number, number][] = [
  ["support-bot", 6_100_000, 182.4],
  ["triage-agent", 1_200_000, 96.1],
  ["research-assistant", 1_050_000, 61.25],
  ["billing-helper", 980_000, 41.2],
  ["code-reviewer", 910_000, 21.93],
  ["onboarding-guide", 870_000, 10.0],
  ["claims-intake", 820_000, 0],
  ["hr-policy-answers", 760_000, 0],
  ["sales-research", 700_000, 0],
  ["release-notes-writer", 650_000, 0],
];

const LATENCY = [640, 820, 4_940, 510, 1_120, 700, 590, 660, 610, 720];

export const usageMetrics: UsageMetricsData = {
  usageMetrics: {
    summary: {
      totalApiCalls: 412_880,
      totalTokens: TOKENS.reduce((a, b) => a + b, 0),
      totalCost: 412.88,
      activeAgents: 11,
      storageUsedMb: 812,
    },
    timeSeries: TOKENS.map((tokens, i) => ({
      date: day(i, TOKENS.length),
      apiCalls: Math.round(tokens / 25),
      tokens,
      cost: Number((tokens * 0.0000135).toFixed(2)),
    })),
    // Ten agents and ten endpoints: with the value among its own peers, one
    // outlier can only clear two standard deviations when there are at least
    // six, so the detector's peer rules have something to find.
    byAgent: AGENTS.map(([name, tokens, cost]) => ({
      agentId: name,
      agentName: name,
      apiCalls: Math.round(tokens / 22),
      tokens,
      cost,
    })),
    byEndpoint: AGENTS.map(([name], i) => ({
      endpoint: name,
      apiCalls: Math.round(AGENTS[i][1] / 22),
      avgLatencyMs: LATENCY[i],
    })),
  },
};

export const emptyUsageMetrics: UsageMetricsData = {
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

const LONG_AGENT =
  "customer-support-escalation-agent-for-enterprise-tier-accounts-eu-west-1";

export const longUsageMetrics: UsageMetricsData = {
  usageMetrics: {
    ...usageMetrics.usageMetrics!,
    summary: {
      totalApiCalls: 9_412_880_114,
      totalTokens: 318_240_331_902,
      totalCost: 4_128_331.57,
      activeAgents: 1_204,
      storageUsedMb: 812_000,
    },
    byAgent: [
      {
        agentId: LONG_AGENT,
        agentName: LONG_AGENT,
        apiCalls: 1,
        tokens: 1,
        cost: 2_240_331.5,
      },
      ...usageMetrics.usageMetrics!.byAgent!,
    ],
    byEndpoint: [
      { endpoint: LONG_AGENT, apiCalls: 1, avgLatencyMs: 18_240 },
      ...usageMetrics.usageMetrics!.byEndpoint!,
    ],
  },
};

export const usageMocks = {
  full: [mockQuery(GET_USAGE_METRICS, usageMetrics)],
  empty: [mockQuery(GET_USAGE_METRICS, emptyUsageMetrics)],
  loading: [mockLoading(GET_USAGE_METRICS)],
  error: [mockError(GET_USAGE_METRICS)],
};

function model(
  overrides: Partial<AIModelData> &
    Pick<AIModelData, "id" | "modelId" | "name">,
): AIModelData {
  return {
    description: null,
    modelType: "chat",
    riskLevel: "low",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    isAvailable: true,
    deprecated: false,
    providerSlug: "anthropic",
    providerName: "Anthropic",
    capabilities: ["tools", "vision"],
    ...overrides,
  };
}

export const aiModels: { aiModels: AIModelData[] } = {
  aiModels: [
    model({
      id: "m1",
      modelId: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      description: "Balanced model for agents and coding.",
    }),
    model({
      id: "m2",
      modelId: "claude-haiku-4-5",
      name: "Claude Haiku 4.5",
      inputPricePerMillion: 1,
      outputPricePerMillion: 5,
    }),
    model({
      id: "m3",
      modelId: "gpt-4.1",
      name: "GPT-4.1",
      providerSlug: "openai",
      providerName: "OpenAI",
      contextWindow: 1_047_576,
      inputPricePerMillion: 2,
      outputPricePerMillion: 8,
      riskLevel: "medium",
    }),
    model({
      id: "m4",
      modelId: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      providerSlug: "google",
      providerName: "Google",
      contextWindow: 1_048_576,
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 10,
      capabilities: ["tools", "vision", "audio", "video", "code"],
    }),
    model({
      id: "m5",
      modelId: "text-embedding-3-large",
      name: "Text Embedding 3 Large",
      providerSlug: "openai",
      providerName: "OpenAI",
      modelType: "embedding",
      contextWindow: 8_191,
      maxOutputTokens: null,
      inputPricePerMillion: 0.13,
      outputPricePerMillion: null,
      capabilities: [],
    }),
    model({
      id: "m6",
      modelId: "gpt-4-0613",
      name: "GPT-4 (June 2023)",
      providerSlug: "openai",
      providerName: "OpenAI",
      contextWindow: 8_192,
      inputPricePerMillion: 30,
      outputPricePerMillion: 60,
      riskLevel: "high",
      deprecated: true,
    }),
  ],
};

export const longAiModels: { aiModels: AIModelData[] } = {
  aiModels: [
    model({
      id: "l1",
      modelId:
        "us.anthropic.claude-opus-4-5-20251101-v1:0-cross-region-inference-profile",
      name: "Claude Opus 4.5 on Amazon Bedrock through the cross-region inference profile",
      providerSlug: "bedrock",
      providerName: "Amazon Bedrock (us-east-1, us-east-2, us-west-2)",
      inputPricePerMillion: 15,
      outputPricePerMillion: 75,
      capabilities: [
        "tools",
        "vision",
        "computer-use",
        "pdf",
        "citations",
        "batch",
      ],
    }),
    ...aiModels.aiModels,
  ],
};

export const aiModelMocks = {
  full: [mockQuery(GET_AI_MODELS, aiModels)],
  empty: [mockQuery(GET_AI_MODELS, { aiModels: [] })],
  loading: [mockLoading(GET_AI_MODELS)],
  error: [mockError(GET_AI_MODELS)],
};

/* REST: GET /budgets/showback?group_by=endpoint */
export const showback: ShowbackReport = {
  entries: [
    {
      dimension_id: "support-bot",
      requests: 18_204,
      committed_usd: 182.4,
      actual_usd: 179.92,
      unreconciled_requests: 0,
      anomaly: false,
      status: "reconciled",
    },
    {
      dimension_id: "triage-agent",
      requests: 9_610,
      committed_usd: 96.1,
      actual_usd: null,
      unreconciled_requests: 412,
      anomaly: false,
      status: "unreconciled",
    },
    {
      dimension_id: "research-assistant",
      requests: 6_100,
      committed_usd: 61.25,
      actual_usd: 88.4,
      unreconciled_requests: 0,
      anomaly: true,
      status: "anomaly",
    },
    {
      dimension_id: "",
      requests: 1_088,
      committed_usd: 10,
      actual_usd: 10,
      unreconciled_requests: 0,
      anomaly: false,
      status: "reconciled",
    },
  ],
  totals: { committed_usd: 349.75, actual_usd: 278.32 },
  source: "trusted-provider-api-reconciliation",
};

export const emptyShowback: ShowbackReport = {
  entries: [],
  totals: { committed_usd: 0, actual_usd: null },
  source: "trusted-provider-api-reconciliation",
};

export const longShowback: ShowbackReport = {
  ...showback,
  entries: [
    {
      dimension_id: LONG_AGENT,
      requests: 9_412_880_114,
      committed_usd: 4_128_331.57,
      actual_usd: 4_128_331.0,
      unreconciled_requests: 0,
      anomaly: false,
      status: "reconciled",
    },
    ...showback.entries,
  ],
};

/* REST: GET /models/route-canary */
export const canaryResults: CanaryResult[] = [
  {
    id: "c1",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    status: "passed",
    reason: "Route allowed by the production network policy.",
    created_at: "2026-10-16T13:40:00Z",
    evidence: { side_effects: false },
  },
  {
    id: "c2",
    provider: "openai",
    model: "gpt-4-0613",
    status: "failed",
    reason: "Model is deprecated in the registry.",
    created_at: "2026-10-16T11:05:00Z",
    evidence: { side_effects: false },
  },
  {
    id: "c3",
    provider: "google",
    model: "gemini-2.5-pro",
    status: "rolled_back",
    reason: "Route allowed; rolled back by leo@calliope.ai.",
    created_at: "2026-10-15T17:22:00Z",
    evidence: { side_effects: false },
  },
];

/* REST: GET /assistant/providers (ids) and GET /settings/llm-providers (stored keys) */
export const availableProviders = ["anthropic", "openai", "bedrock", "ollama"];

export const storedKeys: StoredProviderKey[] = [
  {
    provider: "anthropic",
    keyPrefix: "sk-ant-a",
    isActive: true,
    enabledForAssistant: true,
    updatedAt: "2026-10-12T09:00:00Z",
  },
  {
    provider: "openai",
    keyPrefix: "sk-proj-",
    isActive: true,
    enabledForAssistant: false,
    updatedAt: "2026-09-30T16:20:00Z",
  },
];

/* REST: GET /assistant/models?provider=anthropic */
export const providerModels: ProviderModel[] = [
  {
    id: "pm1",
    model_id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    context_window: 200_000,
    enabled_for_chat: true,
    deprecated: false,
  },
  {
    id: "pm2",
    model_id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    context_window: 200_000,
    enabled_for_chat: true,
    deprecated: false,
  },
  {
    id: "pm3",
    model_id: "claude-opus-4-1",
    name: "Claude Opus 4.1",
    context_window: 200_000,
    enabled_for_chat: false,
    deprecated: false,
  },
  {
    id: "pm4",
    model_id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    context_window: 200_000,
    enabled_for_chat: false,
    deprecated: true,
  },
];
