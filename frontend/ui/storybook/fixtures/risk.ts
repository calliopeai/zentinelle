/**
 * Risk & compliance fixtures. GraphQL data is typed by the result types of
 * the documents the app sends (graphql/risks, graphql/compliance,
 * graphql/compliance-reports) and holds only the fields those documents
 * select. REST data follows ui/screens/risk/rest-types.ts.
 */
import { GET_COMPLIANCE_OVERVIEW } from "@/graphql/compliance/queries";
import type {
  ComplianceCapability,
  ComplianceOverviewData,
  FrameworkCoverage,
} from "@/graphql/compliance/types";
import { GET_COMPLIANCE_REPORTS } from "@/graphql/compliance-reports/queries";
import type {
  ComplianceReportData,
  ComplianceReportsData,
} from "@/graphql/compliance-reports/types";
import { GET_RISK, GET_RISKS, GET_RISK_STATS } from "@/graphql/risks/queries";
import type {
  RiskData,
  RiskDetailData,
  RiskListData,
  RiskStatsData,
} from "@/graphql/risks/types";

import type { CompliancePack } from "../../screens/risk/components/CompliancePacksDialog";
import type {
  AtlasResponse,
  BrocsResponse,
  ControlEvidenceResponse,
  RiskTrendPoint,
} from "../../screens/risk/rest-types";
import { mockError, mockLoading, mockQuery } from "../graphql";

// ---------------------------------------------------------------- risks

/** RISK_FIELDS selects these; `externalReferences` and `lastReviewedByName` are not selected. */
type SelectedRisk = Omit<RiskData, "externalReferences" | "lastReviewedByName">;

const LEVEL = (score: number) =>
  score >= 200
    ? "critical"
    : score >= 75
      ? "high"
      : score >= 18
        ? "medium"
        : "low";

function risk(
  overrides: Partial<SelectedRisk> &
    Pick<SelectedRisk, "id" | "name" | "likelihood" | "impact"> & {
      severity?: number;
    },
): RiskData {
  const { severity = 3, ...rest } = overrides;
  const score = severity * overrides.likelihood * overrides.impact;
  const category = overrides.category ?? "security";
  const status = overrides.status ?? "assessed";
  const value: SelectedRisk = {
    description: "",
    category,
    status,
    mitigationPlan: null,
    mitigationStatus: null,
    residualLikelihood: null,
    residualImpact: null,
    lastReviewedAt: "2026-09-30T15:00:00Z",
    nextReviewDate: "2026-12-30",
    tags: [],
    identifiedAt: "2026-08-12T09:00:00Z",
    createdAt: "2026-08-12T09:00:00Z",
    updatedAt: "2026-10-14T11:20:00Z",
    categoryDisplay: category[0].toUpperCase() + category.slice(1),
    statusDisplay: status[0].toUpperCase() + status.slice(1),
    likelihoodDisplay: null,
    impactDisplay: null,
    riskScore: score,
    riskLevel: LEVEL(score),
    residualRiskScore: score,
    ownerName: "Leo Mata",
    incidentCount: 0,
    ...rest,
  };
  if (value.residualLikelihood && value.residualImpact)
    value.residualRiskScore = value.residualLikelihood * value.residualImpact;
  return value as RiskData;
}

export const risks: RiskData[] = [
  risk({
    id: "r-01",
    name: "Prompt injection through retrieved documents",
    description:
      "Instructions planted in indexed documents reach the support agent's context and steer its tool calls.",
    severity: 8,
    likelihood: 5,
    impact: 5,
    status: "mitigating",
    mitigationPlan:
      "Scan retrieved context before the provider call; require approval for refunds above 200 USD.",
    mitigationStatus: "Context scanning live on support-bot; approvals staged",
    residualLikelihood: 2,
    residualImpact: 5,
    tags: ["atlas:AML.T0051", "support"],
    incidentCount: 2,
  }),
  risk({
    id: "r-02",
    name: "PHI in model prompts",
    category: "privacy",
    severity: 8,
    likelihood: 3,
    impact: 8,
    status: "assessed",
    tags: ["hipaa"],
    incidentCount: 1,
  }),
  risk({
    id: "r-03",
    name: "Provider key leaked in agent logs",
    severity: 5,
    likelihood: 2,
    impact: 8,
    status: "mitigating",
    mitigationPlan:
      "Secret detection on interaction logs, keys rotated every 30 days.",
  }),
  risk({
    id: "r-04",
    name: "Budget overrun on batch summarization",
    category: "financial",
    severity: 3,
    likelihood: 5,
    impact: 3,
    status: "accepted",
  }),
  risk({
    id: "r-05",
    name: "Agent acts on stale customer records",
    category: "operational",
    severity: 3,
    likelihood: 3,
    impact: 2,
    status: "identified",
    ownerName: null,
    lastReviewedAt: null,
    nextReviewDate: null,
  }),
  risk({
    id: "r-06",
    name: "Biased triage of refund requests",
    category: "ethical",
    severity: 2,
    likelihood: 2,
    impact: 3,
    status: "identified",
  }),
  risk({
    id: "r-07",
    name: "Model deprecation breaks the nightly sync",
    category: "operational",
    severity: 2,
    likelihood: 1,
    impact: 2,
    status: "closed",
  }),
];

/** A name, a description and an owner at the lengths people actually write them. */
export const longRisk: RiskData = risk({
  id: "r-99",
  name: "Cross-tenant retrieval through a misconfigured shared vector index used by the customer support, billing reconciliation and nightly sync agents in the EU and US regions",
  description:
    "A shared index built before the tenant split still serves embeddings to three agents. Queries that omit the tenant filter return passages from other customers. ".repeat(
      4,
    ),
  category: "compliance",
  severity: 8,
  likelihood: 8,
  impact: 8,
  status: "identified",
  ownerName: "Maximiliana Wolfeschlegelsteinhausen-Bergerdorff",
  mitigationPlan:
    "Rebuild the index per tenant; deny queries without a tenant filter at the gateway; replay the last 90 days of retrievals to find exposures. ".repeat(
      3,
    ),
  tags: ["gdpr", "ccpa", "eu-west-1", "us-east-2", "vector-index", "p0"],
  incidentCount: 12,
});

export const manyRisks: RiskData[] = Array.from({ length: 40 }, (_, i) =>
  risk({
    ...risks[i % risks.length],
    id: `r-${100 + i}`,
    name: `${risks[i % risks.length].name} (${i + 1})`,
    likelihood: risks[i % risks.length].likelihood,
    impact: risks[i % risks.length].impact,
  }),
);

export const riskList: RiskListData = { risks };

export const riskStats: RiskStatsData = {
  riskStats: {
    totalRisks: 7,
    openRisks: 6,
    criticalRisks: 1,
    highRisks: 1,
    risksByLevel: [
      { level: "critical", count: 1 },
      { level: "high", count: 1 },
      { level: "medium", count: 3 },
      { level: "low", count: 2 },
    ],
    risksByCategory: [
      { category: "security", count: 2 },
      { category: "operational", count: 2 },
      { category: "privacy", count: 1 },
      { category: "financial", count: 1 },
      { category: "ethical", count: 1 },
    ],
    totalIncidents: 9,
    openIncidents: 3,
    incidentsToday: 1,
    incidentsBySeverity: [
      { severity: "critical", count: 1 },
      { severity: "high", count: 2 },
    ],
    incidentsByStatus: [
      { status: "open", count: 2 },
      { status: "investigating", count: 1 },
    ],
    slaMetCount: 6,
    slaBreachedCount: 1,
  },
};

export const emptyRiskStats: RiskStatsData = {
  riskStats: {
    totalRisks: 0,
    openRisks: 0,
    criticalRisks: 0,
    highRisks: 0,
    risksByLevel: [],
    risksByCategory: [],
    totalIncidents: 0,
    openIncidents: 0,
    incidentsToday: 0,
    incidentsBySeverity: [],
    incidentsByStatus: [],
    slaMetCount: 0,
    slaBreachedCount: 0,
  },
};

export const riskTrend: RiskTrendPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const day = new Date(Date.UTC(2026, 8, 17 + i));
    return {
      day: day.toISOString().slice(0, 10),
      index:
        [8, 8, 9, 12, 12, 14, 19, 19, 18, 21, 24, 24, 22, 22, 27][i % 15] +
        (i > 14 ? 4 : 0),
      open_count: 3 + Math.floor(i / 8),
    };
  },
);

export const riskMocks = {
  list: [mockQuery(GET_RISKS, riskList)],
  listEmpty: [mockQuery(GET_RISKS, { risks: [] } satisfies RiskListData)],
  listLoading: [mockLoading(GET_RISKS)],
  listError: [mockError(GET_RISKS, "Could not reach the risk register.")],
  detail: [mockQuery(GET_RISK, { risk: risks[0] } satisfies RiskDetailData)],
  detailMissing: [mockQuery(GET_RISK, { risk: null } satisfies RiskDetailData)],
  detailLoading: [mockLoading(GET_RISK)],
  detailError: [mockError(GET_RISK)],
  stats: [mockQuery(GET_RISK_STATS, riskStats)],
  statsLoading: [mockLoading(GET_RISK_STATS)],
  statsError: [mockError(GET_RISK_STATS)],
};

// ----------------------------------------------------------- compliance

/** The capabilities of backend/zentinelle/models/compliance.py, as complianceOverview returns them. */
const CAPABILITIES: [
  string,
  string,
  "observe" | "control",
  string[],
  string[],
][] = [
  [
    "pii_detection",
    "PII Detection",
    "observe",
    ["pii_filter"],
    ["HIPAA", "GDPR", "CCPA", "SOC2"],
  ],
  ["phi_detection", "PHI Detection", "observe", [], ["HIPAA"]],
  [
    "secret_detection",
    "Secret/Credential Detection",
    "observe",
    [],
    ["SOC2", "ISO27001", "PCI-DSS"],
  ],
  [
    "prompt_injection",
    "Prompt Injection Detection",
    "observe",
    ["prompt_injection"],
    ["EU_AI_ACT", "NIST_AI_RMF"],
  ],
  [
    "jailbreak_detection",
    "Jailbreak Attempt Detection",
    "observe",
    [],
    ["EU_AI_ACT", "NIST_AI_RMF"],
  ],
  [
    "audit_logging",
    "Audit Logging",
    "observe",
    ["audit_policy"],
    ["HIPAA", "GDPR", "SOC2", "EU_AI_ACT", "ISO27001", "PCI-DSS"],
  ],
  [
    "cost_tracking",
    "Cost & Token Tracking",
    "observe",
    ["budget_limit"],
    ["SOC2"],
  ],
  [
    "usage_analytics",
    "Usage Analytics",
    "observe",
    [],
    ["SOC2", "EU_AI_ACT", "NIST_AI_RMF"],
  ],
  [
    "model_tracking",
    "Model Identification",
    "observe",
    [],
    ["EU_AI_ACT", "NIST_AI_RMF", "ISO42001"],
  ],
  [
    "content_filtering",
    "Content Filtering",
    "control",
    ["content_filter", "output_filter"],
    ["HIPAA", "GDPR", "SOC2"],
  ],
  ["rate_limiting", "Rate Limiting", "control", ["rate_limit"], ["SOC2"]],
  [
    "model_restriction",
    "Model Restriction",
    "control",
    ["model_restriction"],
    ["EU_AI_ACT", "ISO42001"],
  ],
  [
    "context_limits",
    "Context Window Limits",
    "control",
    ["context_limit"],
    ["HIPAA"],
  ],
  [
    "human_oversight",
    "Human-in-the-Loop",
    "control",
    ["human_oversight"],
    ["EU_AI_ACT", "NIST_AI_RMF"],
  ],
  [
    "agent_capabilities",
    "Agent Capability Control",
    "control",
    ["agent_capability"],
    ["EU_AI_ACT", "NIST_AI_RMF"],
  ],
  [
    "agent_memory",
    "Agent Memory Control",
    "control",
    ["agent_memory"],
    ["GDPR", "CCPA"],
  ],
  [
    "data_retention",
    "Data Retention",
    "control",
    ["data_retention"],
    ["HIPAA", "GDPR", "CCPA"],
  ],
];

/** FRAMEWORK_REQUIREMENTS of the backend: id, name, description, required, recommended. */
const FRAMEWORKS: [string, string, string, string[], string[]][] = [
  [
    "HIPAA",
    "HIPAA",
    "Health Insurance Portability and Accountability Act",
    [
      "phi_detection",
      "pii_detection",
      "audit_logging",
      "content_filtering",
      "data_retention",
      "context_limits",
    ],
    ["secret_detection", "rate_limiting"],
  ],
  [
    "GDPR",
    "GDPR",
    "General Data Protection Regulation",
    [
      "pii_detection",
      "audit_logging",
      "data_retention",
      "content_filtering",
      "agent_memory",
    ],
    ["context_limits", "human_oversight"],
  ],
  [
    "SOC2",
    "SOC 2 Type II",
    "Service Organization Control 2",
    ["audit_logging", "secret_detection", "rate_limiting"],
    ["pii_detection", "cost_tracking", "usage_analytics", "content_filtering"],
  ],
  [
    "EU_AI_ACT",
    "EU AI Act",
    "European Union Artificial Intelligence Act",
    [
      "audit_logging",
      "model_tracking",
      "human_oversight",
      "agent_capabilities",
      "prompt_injection",
      "jailbreak_detection",
    ],
    ["usage_analytics", "model_restriction"],
  ],
  [
    "NIST_AI_RMF",
    "NIST AI RMF",
    "NIST AI Risk Management Framework",
    [
      "model_tracking",
      "human_oversight",
      "agent_capabilities",
      "prompt_injection",
      "jailbreak_detection",
    ],
    ["audit_logging", "usage_analytics", "model_restriction"],
  ],
  [
    "CCPA",
    "CCPA",
    "California Consumer Privacy Act",
    ["pii_detection", "data_retention", "agent_memory"],
    ["audit_logging", "content_filtering"],
  ],
  [
    "ISO27001",
    "ISO 27001",
    "Information Security Management",
    ["audit_logging", "secret_detection"],
    ["rate_limiting", "pii_detection"],
  ],
  [
    "ISO42001",
    "ISO 42001",
    "AI Management System",
    ["model_tracking", "model_restriction"],
    ["audit_logging", "human_oversight", "agent_capabilities"],
  ],
  [
    "PCI-DSS",
    "PCI DSS",
    "Payment Card Industry Data Security Standard",
    ["secret_detection", "audit_logging"],
    ["pii_detection", "content_filtering"],
  ],
];

/** The overview the backend computes for a tenant with these capabilities enabled. */
export function complianceOverviewFor(
  enabled: ReadonlySet<string>,
): ComplianceOverviewData {
  const capabilities: ComplianceCapability[] = CAPABILITIES.map(
    ([id, name, capabilityType, policies, frameworks]) => ({
      id,
      name,
      description: `${name} across governed agents.`,
      capabilityType,
      enabled: enabled.has(id),
      supportingPolicies: enabled.has(id) ? policies : [],
      supportingRules: [],
      enforcementOptions: capabilityType === "control" ? ["block", "warn"] : [],
      supportsFrameworks: frameworks,
    }),
  );
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 100);
  const frameworkCoverage: FrameworkCoverage[] = FRAMEWORKS.map(
    ([id, name, description, required, recommended]) => {
      const req = required.filter((c) => enabled.has(c)).length;
      const rec = recommended.filter((c) => enabled.has(c)).length;
      const total = required.length + recommended.length;
      return {
        id,
        name,
        description,
        requiredCovered: req,
        requiredTotal: required.length,
        requiredPercentage: pct(req, required.length),
        missingRequired: required.filter((c) => !enabled.has(c)),
        totalCovered: req + rec,
        totalCount: total,
        totalPercentage: pct(req + rec, total),
        missingRecommended: recommended.filter((c) => !enabled.has(c)),
      };
    },
  );
  return {
    complianceOverview: {
      observeCapabilities: capabilities.filter(
        (c) => c.capabilityType === "observe",
      ),
      controlCapabilities: capabilities.filter(
        (c) => c.capabilityType === "control",
      ),
      capabilitiesEnabled: capabilities.filter((c) => c.enabled).length,
      capabilitiesTotal: capabilities.length,
      frameworkCoverage,
    },
  };
}

export const complianceOverview = complianceOverviewFor(
  new Set([
    "pii_detection",
    "secret_detection",
    "prompt_injection",
    "audit_logging",
    "cost_tracking",
    "usage_analytics",
    "model_tracking",
    "content_filtering",
    "rate_limiting",
    "human_oversight",
    "data_retention",
  ]),
);

export const complianceOverviewNothingEnabled = complianceOverviewFor(
  new Set(),
);

export const complianceOverviewAllEnabled = complianceOverviewFor(
  new Set(CAPABILITIES.map(([id]) => id)),
);

export const complianceMocks = {
  overview: [mockQuery(GET_COMPLIANCE_OVERVIEW, complianceOverview)],
  overviewEmpty: [
    mockQuery(GET_COMPLIANCE_OVERVIEW, complianceOverviewNothingEnabled),
  ],
  overviewLoading: [mockLoading(GET_COMPLIANCE_OVERVIEW)],
  overviewError: [mockError(GET_COMPLIANCE_OVERVIEW)],
};

// -------------------------------------------------------------- reports

export const complianceReports: ComplianceReportData[] = [
  {
    id: "cr-31",
    name: "HIPAA control coverage, Q3 2026",
    framework: "HIPAA",
    generatedAt: "2026-10-01T08:00:00Z",
    period: "2026-07-01 to 2026-09-30",
    status: "completed",
    downloadUrl: "/api/zentinelle/v1/compliance/reports/cr-31/download",
  },
  {
    id: "cr-32",
    name: "EU AI Act readiness",
    framework: "EU_AI_ACT",
    generatedAt: "2026-10-15T17:42:00Z",
    period: "2026-09-15 to 2026-10-15",
    status: "generating",
    downloadUrl: null,
  },
  {
    id: "cr-29",
    name: "SOC 2 Type II evidence pack",
    framework: "SOC2",
    generatedAt: "2026-09-02T10:15:00Z",
    period: "2026-06-01 to 2026-08-31",
    status: "failed",
    downloadUrl: null,
  },
  {
    id: "cr-27",
    name: "All frameworks, August",
    framework: null,
    generatedAt: "2026-09-01T06:00:00Z",
    period: "2026-08-01 to 2026-08-31",
    status: "completed",
    downloadUrl: "/api/zentinelle/v1/compliance/reports/cr-27/download",
  },
];

export const reportsMocks = {
  list: [
    mockQuery(GET_COMPLIANCE_REPORTS, {
      complianceReports,
    } satisfies ComplianceReportsData),
  ],
  empty: [
    mockQuery(GET_COMPLIANCE_REPORTS, {
      complianceReports: [],
    } satisfies ComplianceReportsData),
  ],
  loading: [mockLoading(GET_COMPLIANCE_REPORTS)],
  error: [mockError(GET_COMPLIANCE_REPORTS)],
};

// ------------------------------------------------------------- evidence

export const controlEvidence: ControlEvidenceResponse = {
  evidence: [
    {
      id: "ev-1",
      control_id: "AML.T0051",
      status: "verified-operating",
      effective_status: "verified-operating",
      owner: "security",
      evidence_links: ["https://ci.example.com/runs/88213"],
      captured_at: "2026-10-15T22:10:00Z",
      expires_at: "2026-11-14T22:10:00Z",
      source: "ci:test_assistant_guardrails.py",
      notes: "",
    },
    {
      id: "ev-2",
      control_id: "observe",
      status: "verified-operating",
      effective_status: "stale",
      owner: "Zentinelle platform",
      evidence_links: [],
      captured_at: "2026-08-30T12:00:00Z",
      expires_at: "2026-09-29T12:00:00Z",
      source: "ci:test_event_outbox_dispatch.py",
      notes: "Expired; the nightly run moved to a new runner.",
    },
    {
      id: "ev-3",
      control_id: "AML.T0053",
      status: "failed",
      effective_status: "failed",
      owner: "platform",
      evidence_links: ["https://ci.example.com/runs/88190"],
      captured_at: "2026-10-14T03:00:00Z",
      expires_at: null,
      source: "ci:test_tool_permissions.py",
      notes: "Two tool calls passed without approval in the replay.",
    },
  ],
  coverage: {
    "verified-operating": 1,
    stale: 1,
    failed: 1,
    unknown: 0,
    "observation-only": 0,
    unsupported: 0,
  },
  runtime_coverage: {
    registered_workloads: 4,
    observed_workloads: 3,
    unobserved_workloads: 1,
    coverage_as_of: "2026-10-16T14:05:00Z",
    workloads: [
      {
        agent_id: "support-bot",
        endpoint_id: "a-7f3c",
        status: "observed",
        registered_status: "active",
        last_observed_at: "2026-10-16T14:05:00Z",
        last_event_id: "e-1",
        last_event_type: "tool_call",
      },
      {
        agent_id: "triage-agent",
        endpoint_id: "a-1d9e",
        status: "observed",
        registered_status: "active",
        last_observed_at: "2026-10-16T13:58:00Z",
        last_event_id: "e-2",
        last_event_type: "model_request",
      },
      {
        agent_id: "billing-reconcile",
        endpoint_id: "a-c041",
        status: "observed",
        registered_status: "suspended",
        last_observed_at: "2026-10-11T09:00:00Z",
        last_event_id: "e-3",
        last_event_type: "policy_denied",
      },
      {
        agent_id: "nightly-sync",
        endpoint_id: "a-55b2",
        status: "unknown",
        registered_status: "offline",
        last_observed_at: null,
        last_event_id: null,
        last_event_type: null,
      },
    ],
  },
  coverage_as_of: "2026-10-15T22:10:00Z",
};

export const emptyControlEvidence: ControlEvidenceResponse = {
  evidence: [],
  coverage: {
    "verified-operating": 0,
    stale: 0,
    failed: 0,
    unknown: 0,
    "observation-only": 0,
    unsupported: 0,
  },
  runtime_coverage: {
    registered_workloads: 0,
    observed_workloads: 0,
    unobserved_workloads: 0,
    coverage_as_of: null,
    workloads: [],
  },
  coverage_as_of: null,
};

export const atlas: AtlasResponse = {
  source: "MITRE ATLAS",
  source_url: "https://atlas.mitre.org/",
  source_revision: "2026-09-11",
  retrieved_at: "2026-09-11",
  disclaimer:
    "Threat-model vocabulary only; this mapping is not certification or endorsement.",
  techniques: [
    {
      id: "AML.T0051",
      name: "LLM Prompt Injection",
      control: "prompt_injection",
      enforcement_point: "pre-provider and pre-tool context inspection",
      owner: "security",
      evidence_test: "test_assistant_guardrails.py",
      residual_risk: "Novel or obfuscated injections may evade detection.",
      evidence_status: "verified-operating",
      evidence_captured_at: "2026-10-15T22:10:00Z",
      evidence_id: "ev-1",
    },
    {
      id: "AML.T0053",
      name: "AI Agent Tool Invocation",
      control: "tool_permission_and_approval",
      enforcement_point: "tool dispatch and policy admission",
      owner: "platform",
      evidence_test: "test_tool_permissions.py",
      residual_risk: "Permitted tools may still contain unsafe side effects.",
      evidence_status: "failed",
      evidence_captured_at: "2026-10-14T03:00:00Z",
      evidence_id: "ev-3",
    },
    {
      id: "AML.T0080",
      name: "AI Agent Context Poisoning",
      control: "untrusted_context_scanning",
      enforcement_point: "context normalization",
      owner: "security",
      evidence_test: "test_assistant_guardrails.py",
      residual_risk:
        "Memory and thread poisoning require independent persistence controls.",
      evidence_status: "unverified",
      evidence_captured_at: null,
      evidence_id: null,
    },
    {
      id: null,
      name: "Model supply chain substitution",
      control: "model_restriction",
      enforcement_point: "provider routing",
      owner: "platform",
      evidence_test: "test_model_routing.py",
      residual_risk: "Self-hosted models are not attested.",
      evidence_status: "unverified",
      evidence_captured_at: null,
      evidence_id: null,
    },
  ],
};

export const brocs: BrocsResponse = {
  framework: "BROCS 1.3",
  source_url: "https://brocs.fyi/",
  source_revision: "1.3",
  disclaimer:
    "Diagnostic control mapping only; not BROCS certification or a maturity score.",
  domains: [
    {
      id: "build",
      owner: "customer/developer platform",
      control: "SDK registration and conformance fixtures",
      evidence_test: "test_sdk_contract.py",
      customer_responsibility:
        "Run supported SDK and gateway integration checks.",
      evidence_status: "unknown",
      evidence_id: null,
      evidence_captured_at: null,
    },
    {
      id: "run",
      owner: "customer/runtime operator",
      control: "Workload identity, policy admission and model/tool routing",
      evidence_test: "test_dependable_controls.py",
      customer_responsibility:
        "Protect deployment identity and egress boundaries.",
      evidence_status: "verified-operating",
      evidence_id: "ev-9",
      evidence_captured_at: "2026-10-12T04:00:00Z",
    },
    {
      id: "observe",
      owner: "Zentinelle platform",
      control: "Correlated events, traces, delivery health and incidents",
      evidence_test: "test_event_outbox_dispatch.py",
      customer_responsibility:
        "Connect paging and retain external checkpoints.",
      evidence_status: "stale",
      evidence_id: "ev-2",
      evidence_captured_at: "2026-08-30T12:00:00Z",
    },
    {
      id: "control",
      owner: "Zentinelle governance",
      control: "Staged policy changes, approvals, containment and rollback",
      evidence_test: "test_policy_change.py",
      customer_responsibility:
        "Assign approvers and acknowledge production rollouts.",
      evidence_status: "verified-operating",
      evidence_id: "ev-10",
      evidence_captured_at: "2026-10-15T01:00:00Z",
    },
    {
      id: "secure",
      owner: "Zentinelle security",
      control:
        "Guardrails, model restrictions, secrets, budgets, retention and audit",
      evidence_test: "test_assistant_guardrails.py",
      customer_responsibility:
        "Configure risk tolerances, legal holds and provider boundaries.",
      evidence_status: "observation-only",
      evidence_id: "ev-11",
      evidence_captured_at: "2026-10-15T22:10:00Z",
    },
  ],
};

/** A story at 768px wide, the narrow width every screen is checked at. */
export const NARROW = {
  globals: { viewport: { value: "w768", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        w768: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
  },
} as const;

/** `ListCompliancePacks` (a mutation the dialog sends on open), its `packs`. */
export const compliancePacks: CompliancePack[] = [
  {
    name: "hipaa",
    displayName: "HIPAA baseline",
    version: "1.2.0",
    description:
      "PHI and PII detection, retention and audit logging for covered entities.",
    policyCount: 9,
  },
  {
    name: "gdpr",
    displayName: "GDPR essentials",
    version: "1.0.3",
    description:
      "PII handling, memory limits and retention for EU personal data.",
    policyCount: 7,
  },
  {
    name: "eu-ai-act",
    displayName: "EU AI Act high-risk systems",
    version: "0.9.0",
    description: "Human oversight, model tracking and injection defenses.",
    policyCount: 11,
  },
];
