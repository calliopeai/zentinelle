/**
 * The Policies workspace's data: `GetPolicies`, `GetPolicy`,
 * `GetPolicyOptions`, `SimulatePolicy` and `PolicyAnalyzer`
 * (graphql/policies/queries.ts, simulate.ts), plus the REST payloads the
 * Effective, Changes and History views read (ui/screens/policies/rest-types.ts).
 */
import {
  GET_POLICIES,
  GET_POLICY,
  GET_POLICY_OPTIONS,
} from "@/graphql/policies/queries";
import {
  GET_POLICY_ANALYZER,
  SIMULATE_POLICY,
  type SimulatePolicyResult,
} from "@/graphql/policies/simulate";
import type {
  PolicyData,
  PolicyDetailData,
  PolicyListData,
  PolicyOptionsData,
} from "@/graphql/policies/types";

import type { PolicyAnalyzerData } from "../../screens/policies/map";
import type {
  EffectivePolicyResponse,
  PolicyChangeSet,
  PolicyDiff,
  PolicyVersion,
} from "../../screens/policies/rest-types";
import { mockError, mockLoading, mockQuery } from "../graphql";

function policy(
  overrides: Partial<PolicyData> &
    Pick<PolicyData, "id" | "name" | "policyType">,
): PolicyData {
  return {
    description: "",
    scopeType: "organization",
    config: {},
    priority: 100,
    enforcement: "enforce",
    action: "block",
    blockLevel: "turn",
    steerMessage: "",
    escalation: null,
    enabled: true,
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-10-14T09:12:00Z",
    scopeName: null,
    createdByUsername: "leo@calliope.ai",
    ...overrides,
  };
}

export const budgetPolicy = policy({
  id: "pol-budget-org",
  name: "Monthly spend cap",
  description:
    "Caps model spend for the whole organization, with an alert at 80 percent.",
  policyType: "budget_limit",
  config: {
    monthly_budget_usd: 5000,
    alert_threshold_percent: 80,
    hard_limit: true,
  },
  action: "block",
});

export const policyList: PolicyData[] = [
  budgetPolicy,
  policy({
    id: "pol-budget-support",
    name: "Support deployment budget",
    policyType: "budget_limit",
    scopeType: "deployment",
    scopeName: "astrolift-prod",
    priority: 200,
    config: {
      monthly_budget_usd: 800,
      alert_threshold_percent: 75,
      hard_limit: false,
    },
    action: "alert",
  }),
  policy({
    id: "pol-net-egress",
    name: "Outbound allowlist",
    description: "Agents reach only the domains the platform team approved.",
    policyType: "network_policy",
    config: {
      allowed_outbound_domains: [
        "api.openai.com",
        "api.anthropic.com",
        "internal.example.com",
      ],
      block_public_internet: true,
    },
  }),
  policy({
    id: "pol-oversight-refunds",
    name: "Refunds need a person",
    policyType: "human_oversight",
    scopeType: "endpoint",
    scopeName: "support-bot",
    action: "require_approval",
    config: {
      require_approval_for_actions: ["issue_refund"],
      max_autonomous_actions: 5,
    },
  }),
  policy({
    id: "pol-rate-default",
    name: "Default rate limit",
    policyType: "rate_limit",
    enforcement: "audit",
    action: "warn",
    config: { requests_per_minute: 120, tokens_per_day: 2000000 },
  }),
  policy({
    id: "pol-rate-dup",
    name: "Legacy rate limit",
    policyType: "rate_limit",
    enforcement: "audit",
    action: "warn",
    config: { requests_per_minute: 60 },
  }),
  policy({
    id: "pol-tools-support",
    name: "Support tools",
    policyType: "tool_permission",
    scopeType: "sub_organization",
    scopeName: "Customer support",
    config: {
      allowed_tools: ["search_kb", "create_ticket"],
      denied_tools: ["shell"],
      requires_approval: ["issue_refund"],
    },
  }),
  policy({
    id: "pol-output-old",
    name: "Old output filter",
    policyType: "output_filter",
    enabled: false,
    enforcement: "disabled",
    config: {},
  }),
];

/** One policy with every long string the console must wrap. */
export const longPolicy = policy({
  id: "pol-long-0123456789abcdef0123456789abcdef",
  name: "Customer support deployment: outbound network allowlist for the refunds and billing escalation agents in every region",
  description:
    "Restricts outbound traffic for the refunds and billing escalation agents to the payment processor, the ticketing system and the internal knowledge base. Everything else is blocked at the gateway, including public package registries, so a prompt injection cannot exfiltrate data through a lookalike domain.",
  policyType: "network_policy",
  scopeType: "deployment",
  scopeName:
    "customer-support-refunds-and-billing-escalation-eu-west-1-production",
  createdByUsername: "platform-automation-service-account@security.example.com",
  config: {
    allowed_outbound_domains: Array.from(
      { length: 12 },
      (_, i) => `payments-${i}.processor.a-very-long-domain-name.example.com`,
    ),
  },
});

export const manyPolicies: PolicyData[] = [
  ...policyList,
  longPolicy,
  ...Array.from({ length: 30 }, (_, i) =>
    policy({
      id: `pol-gen-${i}`,
      name: `Generated guardrail ${i + 1}`,
      policyType: i % 2 ? "ai_guardrail" : "output_filter",
      priority: 100 + i,
      config: { pii_redaction: true },
    }),
  ),
];

export const policyOptions: PolicyOptionsData = {
  policyOptions: {
    policyTypes: [
      {
        value: "budget_limit",
        label: "Budget Limit",
        description: "Spend caps per period",
        category: "Resources",
        configSchema: {
          monthly_budget_usd: "float",
          alert_threshold_percent: "int",
          hard_limit: "bool",
        },
      },
      {
        value: "rate_limit",
        label: "Rate Limit",
        description: "Requests and tokens per window",
        category: "Resources",
        configSchema: {
          requests_per_minute: "int",
          requests_per_hour: "int",
          tokens_per_day: "int",
        },
      },
      {
        value: "network_policy",
        label: "Network Policy",
        description: "Outbound domains an agent may reach",
        category: "Security",
        configSchema: {
          allowed_outbound_domains: "list",
          blocked_outbound_domains: "list",
          block_public_internet: "bool",
        },
      },
      {
        value: "tool_permission",
        label: "Tool Permission",
        description: "Tools an agent may call",
        category: "Security",
        configSchema: {
          allowed_tools: "list",
          denied_tools: "list",
          requires_approval: "list",
        },
      },
      {
        value: "human_oversight",
        label: "Human Oversight",
        description: "Actions that wait for a person",
        category: "Agent Controls",
        configSchema: {
          require_approval_for_actions: "list",
          auto_approve_threshold: "float",
          escalation_email: "str",
          max_autonomous_actions: "int",
        },
      },
      {
        value: "system_prompt",
        label: "System Prompt",
        description: "Instructions every model call carries",
        category: "AI Behavior",
        configSchema: {
          prompt_text: "str",
          applies_to: "list",
          append_mode: "bool",
        },
      },
    ],
    scopeTypes: [
      { value: "organization", label: "Organization-wide" },
      { value: "sub_organization", label: "Team/Division" },
      { value: "deployment", label: "Specific Deployment" },
      { value: "endpoint", label: "Specific Endpoint" },
      { value: "user", label: "Specific User" },
    ],
    enforcementLevels: [
      {
        value: "enforce",
        label: "Enforce",
        description: "Apply the policy's action when it matches",
      },
      {
        value: "audit",
        label: "Audit Only",
        description:
          "Record matches without disrupting the agent; alert steps still alert",
      },
      {
        value: "disabled",
        label: "Disabled",
        description: "Policy is inactive",
      },
    ],
  },
};

export const simulation: SimulatePolicyResult = {
  simulatePolicy: {
    totalEvents: 18240,
    wouldBlock: 312,
    wouldWarn: 1104,
    wouldPass: 16790,
    inconclusive: 34,
    impactPercent: 7.8,
    blockedSamples: [
      "support-bot: GET https://pastebin.com/raw/8f2k (not on the allowlist)",
      "triage-agent: POST https://webhook.site/1d9e (not on the allowlist)",
    ],
    simulatedPolicyType: "network_policy",
    lookbackDays: 7,
  },
};

export const simulationQuiet: SimulatePolicyResult = {
  simulatePolicy: {
    ...simulation.simulatePolicy,
    totalEvents: 0,
    wouldBlock: 0,
    wouldWarn: 0,
    wouldPass: 0,
    inconclusive: 0,
    impactPercent: 0,
    blockedSamples: [],
  },
};

export const analyzerData: PolicyAnalyzerData = {
  policies: policyList.map(
    ({
      id,
      name,
      policyType,
      scopeType,
      enforcement,
      enabled,
      priority,
      config,
    }) => ({
      id,
      name,
      policyType,
      scopeType,
      enforcement,
      enabled,
      priority,
      config,
    }),
  ),
  endpoints: [
    {
      id: "a-7f3c",
      agentId: "agent-a-7f3c",
      name: "support-bot",
      agentType: "langgraph",
      status: "active",
    },
    {
      id: "a-1d9e",
      agentId: "agent-a-1d9e",
      name: "triage-agent",
      agentType: "langgraph",
      status: "active",
    },
  ],
};

export const effectivePolicy: EffectivePolicyResponse = {
  policies: [
    {
      id: "pol-budget-org",
      name: "Monthly spend cap",
      type: "budget_limit",
      scope: "organization",
      priority: 100,
      enforcement: "enforce",
      config: budgetPolicy.config,
    },
    {
      id: "pol-tools-support",
      name: "Support tools",
      type: "tool_permission",
      scope: "sub_organization",
      priority: 100,
      enforcement: "enforce",
      config: null,
    },
    {
      id: "pol-budget-support",
      name: "Support deployment budget",
      type: "budget_limit",
      scope: "deployment",
      priority: 200,
      enforcement: "enforce",
      config: null,
    },
    {
      id: "pol-oversight-refunds",
      name: "Refunds need a person",
      type: "human_oversight",
      scope: "endpoint",
      priority: 100,
      enforcement: "enforce",
      config: null,
    },
  ],
  resolved: {
    system_prompt:
      "You are the Example Co support assistant. Never promise a refund; open a ticket instead.",
    ai_guardrails: { pii_redaction: true, prompt_injection_detection: true },
    tool_permissions: {
      allowed: ["search_kb", "create_ticket"],
      denied: ["shell"],
      requires_approval: ["issue_refund"],
    },
    rate_limits: { requests_per_minute: 120 },
    budget_limits: {
      monthly_budget_usd: 800,
      alert_threshold_percent: 75,
      hard_limit: false,
    },
    resource_quotas: {},
    secret_access: { allowed_bundles: ["support-crm"], denied_providers: [] },
  },
};

export const effectiveNone: EffectivePolicyResponse = {
  policies: [],
  resolved: {
    system_prompt: null,
    ai_guardrails: {},
    tool_permissions: { allowed: [], denied: [], requires_approval: [] },
    rate_limits: {},
    budget_limits: {},
    resource_quotas: {},
    secret_access: { allowed_bundles: [], denied_providers: [] },
  },
};

function change(
  overrides: Partial<PolicyChangeSet> &
    Pick<PolicyChangeSet, "id" | "title" | "status">,
): PolicyChangeSet {
  return {
    tenant_id: "tenant-example",
    description: "",
    changes: [],
    base_versions: {},
    validation: {},
    applied_snapshots: [],
    target_selectors: {},
    created_by: "leo@calliope.ai",
    reviewed_by: "",
    approved_by: "",
    created_at: "2026-10-15T16:20:00Z",
    updated_at: "2026-10-16T09:00:00Z",
    staged_at: null,
    promoted_at: null,
    rolled_back_at: null,
    ...overrides,
  };
}

export const changeSets: PolicyChangeSet[] = [
  change({
    id: "chg-7f3c2a91",
    title: "Tighten the outbound allowlist",
    description:
      "Drops internal.example.com and blocks the public internet for support agents.",
    status: "staged",
    reviewed_by: "ops@example.com",
    staged_at: "2026-10-16T08:40:00Z",
    changes: [
      {
        op: "update",
        policy_id: "pol-net-egress",
        config: {
          allowed_outbound_domains: ["api.openai.com", "api.anthropic.com"],
        },
      },
    ],
    validation: { simulated_events: 18240, would_block: 312 },
    target_selectors: { deployment: "astrolift-prod" },
  }),
  change({
    id: "chg-1d9e0b22",
    title: "Raise the support budget to 1,000 USD",
    status: "draft",
  }),
  change({
    id: "chg-55b2c003",
    title: "Require approval for refunds over 100 USD",
    status: "validated",
    reviewed_by: "ops@example.com",
  }),
  change({
    id: "chg-c041d004",
    title: "Add the EU data access policy",
    status: "approved",
    approved_by: "admin@example.com",
  }),
  change({
    id: "chg-9a10e005",
    title: "New rate limits for triage",
    status: "promoted",
    promoted_at: "2026-10-12T11:00:00Z",
    approved_by: "admin@example.com",
  }),
  change({
    id: "chg-0b77f006",
    title: "Remove the legacy output filter",
    status: "rejected",
  }),
];

export const policyVersions: PolicyVersion[] = [
  {
    id: 3,
    policy_id: "pol-budget-org",
    version: 3,
    snapshot: {
      config: {
        monthly_budget_usd: 5000,
        alert_threshold_percent: 80,
        hard_limit: true,
      },
    },
    changed_by: "leo@calliope.ai",
    changed_at: "2026-10-14T09:12:00Z",
    change_summary: "Hard limit on",
  },
  {
    id: 2,
    policy_id: "pol-budget-org",
    version: 2,
    snapshot: {
      config: { monthly_budget_usd: 5000, alert_threshold_percent: 80 },
    },
    changed_by: "ops@example.com",
    changed_at: "2026-10-01T15:30:00Z",
    change_summary: "Alert at 80 percent",
  },
  {
    id: 1,
    policy_id: "pol-budget-org",
    version: 1,
    snapshot: { config: { monthly_budget_usd: 4000 } },
    changed_by: "leo@calliope.ai",
    changed_at: "2026-09-02T10:00:00Z",
    change_summary: null,
  },
];

export const policyDiff: PolicyDiff = {
  policy_id: "pol-budget-org",
  from_version: 2,
  to_version: 3,
  added: { "config.hard_limit": true },
  removed: {},
  changed: { "config.alert_threshold_percent": { from: 75, to: 80 } },
};

export const ALL_POLICY_TYPES = [
  "system_prompt",
  "ai_guardrail",
  "model_restriction",
  "output_filter",
  "agent_capability",
  "human_oversight",
  "budget_limit",
  "rate_limit",
  "tool_permission",
  "network_policy",
  "secret_access",
  "data_access",
];

export const policiesMocks = {
  full: [
    mockQuery(GET_POLICIES, { policies: policyList } satisfies PolicyListData),
  ],
  many: [
    mockQuery(GET_POLICIES, {
      policies: manyPolicies,
    } satisfies PolicyListData),
  ],
  empty: [mockQuery(GET_POLICIES, { policies: [] } satisfies PolicyListData)],
  loading: [mockLoading(GET_POLICIES)],
  error: [mockError(GET_POLICIES)],
};

export const policyMocks = {
  full: [
    mockQuery(GET_POLICY, { policy: budgetPolicy } satisfies PolicyDetailData),
  ],
  missing: [mockQuery(GET_POLICY, { policy: null } satisfies PolicyDetailData)],
  loading: [mockLoading(GET_POLICY)],
  error: [mockError(GET_POLICY)],
};

export const policyOptionsMocks = {
  full: [mockQuery(GET_POLICY_OPTIONS, policyOptions)],
  loading: [mockLoading(GET_POLICY_OPTIONS)],
  error: [mockError(GET_POLICY_OPTIONS)],
};

export const simulateMocks = {
  full: [mockQuery(SIMULATE_POLICY, simulation)],
  quiet: [mockQuery(SIMULATE_POLICY, simulationQuiet)],
  error: [
    mockError(
      SIMULATE_POLICY,
      "simulatePolicy needs a policy type the evaluator knows.",
    ),
  ],
};

export const analyzerMocks = {
  full: [mockQuery(GET_POLICY_ANALYZER, analyzerData)],
  empty: [
    mockQuery(GET_POLICY_ANALYZER, {
      policies: [],
      endpoints: [],
    } satisfies PolicyAnalyzerData),
  ],
  loading: [mockLoading(GET_POLICY_ANALYZER)],
  error: [mockError(GET_POLICY_ANALYZER)],
};
