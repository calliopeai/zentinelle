/**
 * Settings (admin): the real operations the routes send, answered with data
 * holding only the fields each selects. GraphQL: GetMyOrganization
 * (graphql/settings), ApiKeys (graphql/api-keys), LegalHolds and
 * LegalHoldOptions (graphql/legal-holds). REST, typed after the admin views
 * (backend/zentinelle/api/views): settings/runtime and settings/astrolift.
 * RetentionData is a query inline in app/(app)/retention/page.tsx, not
 * exported, so its fixture is typed by hand after the selection; it moves to
 * graphql/retention/queries.ts when the route is assembled.
 */
import type { ApiKeyData } from "@/graphql/api-keys/hooks";
import { GET_API_KEYS } from "@/graphql/api-keys/queries";
import {
  GET_LEGAL_HOLDS,
  GET_LEGAL_HOLD_OPTIONS,
} from "@/graphql/legal-holds/queries";
import type {
  LegalHoldData,
  LegalHoldOptionsData,
  LegalHoldsQueryData,
} from "@/graphql/legal-holds/types";
import { GET_MY_ORGANIZATION } from "@/graphql/settings/queries";
import type { MyOrganizationData } from "@/graphql/settings/types";

import type {
  AstroliftInstall,
  CreatedApiKey,
  EnrollmentCode,
  RetentionPolicy,
  RuntimeSnapshot,
} from "../../screens/settings/model";
import { mockError, mockLoading, mockQuery } from "../graphql";

/** A 768px-wide frame, for the narrow story of each screen. */
export const NARROW = {
  parameters: {
    viewport: {
      options: {
        narrow: {
          name: "768px",
          styles: { width: "768px", height: "1024px" },
          type: "tablet",
        },
      },
    },
  },
  globals: { viewport: { value: "narrow", isRotated: false } },
} as const;

const LONG =
  "Acme Robotics Holdings International, Applied Autonomy and Safety Research Division (EMEA and APAC)";

// GetMyOrganization

export const organization: MyOrganizationData = {
  myOrganization: {
    id: "org-7f3c2a91",
    name: "Acme Robotics",
    slug: "acme-robotics",
    tier: "enterprise",
    deploymentModel: "self_hosted",
    zentinelleTier: "pro",
    createdAt: "2026-09-02T10:00:00Z",
    settings: {
      contact_email: "security@acme.example",
      timezone: "Europe/London",
      default_policy_mode: "warn",
      audit_logging: true,
      email_notifications: true,
      slack_notifications: true,
      webhook_url: "https://hooks.slack.com/services/T000/B000/XXXX",
    },
  },
};

/** A fresh organization: nothing set beyond its name. */
export const bareOrganization: MyOrganizationData = {
  myOrganization: {
    ...organization.myOrganization!,
    settings: {},
  },
};

export const longOrganization: MyOrganizationData = {
  myOrganization: {
    ...organization.myOrganization!,
    name: LONG,
    slug: "acme-robotics-holdings-international-applied-autonomy-and-safety-research",
    settings: {
      ...organization.myOrganization!.settings,
      contact_email:
        "governance-risk-and-compliance-notifications@acme-robotics-holdings.example",
      webhook_url:
        "https://hooks.slack.com/services/T0123456789/B0123456789/abcdefghijklmnopqrstuvwxabcdefghijklmnopqrstuvwx",
    },
  },
};

export const organizationMocks = {
  full: [mockQuery(GET_MY_ORGANIZATION, organization)],
  loading: [mockLoading(GET_MY_ORGANIZATION)],
  error: [mockError(GET_MY_ORGANIZATION)],
};

// ApiKeys

// The wire sends null for an unset field; ApiKeyData types those fields as
// optional. A missing field would make Apollo drop the whole result.
const NULL = null as unknown as undefined;

function key(
  overrides: Partial<ApiKeyData> & Pick<ApiKeyData, "id" | "name">,
): ApiKeyData {
  return {
    description: "",
    keyPrefix: `znt_${overrides.id}`,
    status: "active",
    scopes: ["read"],
    lastUsedAt: "2026-10-16T13:40:00Z",
    expiresAt: NULL,
    createdAt: "2026-09-10T09:00:00Z",
    createdByUsername: "leo@calliope.ai",
    ...overrides,
  };
}

export const apiKeys: { apiKeys: ApiKeyData[] } = {
  apiKeys: [
    key({
      id: "7f3c",
      name: "ci-policy-sync",
      description: "GitHub Actions: policies as code",
      scopes: ["read", "write"],
    }),
    key({
      id: "1d9e",
      name: "grafana-usage",
      description: "Usage dashboards",
      lastUsedAt: "2026-10-16T14:05:00Z",
    }),
    key({
      id: "55b2",
      name: "terraform-admin",
      scopes: ["admin"],
      lastUsedAt: NULL,
    }),
    key({
      id: "c041",
      name: "old-exporter",
      status: "revoked",
      lastUsedAt: "2026-08-01T08:00:00Z",
    }),
  ],
};

export const longApiKeys: { apiKeys: ApiKeyData[] } = {
  apiKeys: [
    key({
      id: "9a10",
      name: "acme-robotics-applied-autonomy-research-nightly-evaluation-harness-export",
      description: LONG,
      scopes: ["read", "write", "admin"],
      createdByUsername:
        "governance-risk-and-compliance-automation@acme-robotics-holdings.example",
    }),
    ...apiKeys.apiKeys,
  ],
};

export const apiKeyMocks = {
  full: [mockQuery(GET_API_KEYS, apiKeys)],
  empty: [mockQuery(GET_API_KEYS, { apiKeys: [] })],
  loading: [mockLoading(GET_API_KEYS)],
  error: [mockError(GET_API_KEYS)],
};

export const createdApiKey: CreatedApiKey = {
  name: "ci-policy-sync",
  keyPrefix: "znt_7f3c",
  apiKey: "znt_7f3c2a91b04e4d6f8a1c9e2b5d7f0a3c6e8b1d4f",
};

// LegalHolds and LegalHoldOptions

function hold(
  overrides: Partial<LegalHoldData> & Pick<LegalHoldData, "id" | "name">,
): LegalHoldData {
  return {
    description: null,
    referenceNumber: null,
    holdType: "litigation",
    holdTypeDisplay: "Litigation",
    status: "active",
    statusDisplay: "Active",
    appliesToAll: true,
    entityTypes: [],
    userIdentifiers: [],
    dataFrom: null,
    dataTo: null,
    effectiveDate: "2026-09-15T00:00:00Z",
    expirationDate: null,
    releasedAt: null,
    custodianEmail: "legal@acme.example",
    notifyOnAccess: false,
    notificationEmails: [],
    isActive: true,
    createdAt: "2026-09-15T00:00:00Z",
    updatedAt: "2026-09-15T00:00:00Z",
    ...overrides,
  };
}

export const legalHolds: LegalHoldsQueryData = {
  legalHolds: [
    hold({ id: "h-1", name: "Doe v. Acme", referenceNumber: "CV-2026-0412" }),
    hold({
      id: "h-2",
      name: "EU AI Act readiness audit",
      holdType: "regulatory",
      holdTypeDisplay: "Regulatory",
      appliesToAll: false,
      entityTypes: ["interactions", "audit_logs"],
      expirationDate: "2027-03-31T00:00:00Z",
    }),
    hold({
      id: "h-3",
      name: "Q2 incident review",
      holdType: "internal",
      holdTypeDisplay: "Internal",
      status: "released",
      statusDisplay: "Released",
      isActive: false,
      releasedAt: "2026-08-30T00:00:00Z",
      custodianEmail: null,
    }),
  ],
};

export const longLegalHolds: LegalHoldsQueryData = {
  legalHolds: [
    hold({
      id: "h-9",
      name: LONG,
      referenceNumber:
        "CV-2026-0412-AMENDED-COMPLAINT-CONSOLIDATED-WITH-CV-2026-0533",
      appliesToAll: false,
      entityTypes: [
        "events",
        "interactions",
        "scans",
        "audit_logs",
        "sessions",
      ],
      userIdentifiers: ["u-1", "u-2", "u-3"],
      custodianEmail:
        "outside-counsel-litigation-support@acme-robotics-holdings.example",
    }),
    ...legalHolds.legalHolds,
  ],
};

export const legalHoldOptions: LegalHoldOptionsData = {
  legalHoldOptions: {
    holdTypes: [
      { value: "litigation", label: "Litigation" },
      { value: "regulatory", label: "Regulatory" },
      { value: "internal", label: "Internal" },
      { value: "preservation", label: "Preservation" },
    ],
    statuses: [
      { value: "active", label: "Active" },
      { value: "released", label: "Released" },
      { value: "expired", label: "Expired" },
    ],
  },
};

export const legalHoldMocks = {
  full: [
    mockQuery(GET_LEGAL_HOLDS, legalHolds),
    mockQuery(GET_LEGAL_HOLD_OPTIONS, legalHoldOptions),
  ],
  empty: [
    mockQuery(GET_LEGAL_HOLDS, { legalHolds: [] }),
    mockQuery(GET_LEGAL_HOLD_OPTIONS, legalHoldOptions),
  ],
  loading: [
    mockLoading(GET_LEGAL_HOLDS),
    mockQuery(GET_LEGAL_HOLD_OPTIONS, legalHoldOptions),
  ],
  error: [
    mockError(GET_LEGAL_HOLDS),
    mockQuery(GET_LEGAL_HOLD_OPTIONS, legalHoldOptions),
  ],
};

// RetentionData.retentionPolicies (inline query; see the note at the top)

export const retentionPolicies: RetentionPolicy[] = [
  {
    id: "r-1",
    name: "Telemetry, 90 days",
    description: "Raw agent events",
    entityType: "events",
    entityTypeDisplay: "Telemetry Events",
    retentionDays: 90,
    minimumRetentionDays: null,
    expirationAction: "delete",
    expirationActionDisplay: "Permanently Delete",
    complianceRequirement: "none",
    complianceRequirementDisplay: "No Specific Requirement",
    enabled: true,
    priority: 0,
  },
  {
    id: "r-2",
    name: "Audit log, 7 years",
    description: null,
    entityType: "audit_logs",
    entityTypeDisplay: "Audit Logs",
    retentionDays: 2555,
    minimumRetentionDays: 2555,
    expirationAction: "archive",
    expirationActionDisplay: "Archive to Cold Storage",
    complianceRequirement: "sox",
    complianceRequirementDisplay: "SOX (7 Year Minimum)",
    enabled: true,
    priority: 10,
  },
  {
    id: "r-3",
    name: "Interactions, anonymize after a year",
    description: "Prompts and completions",
    entityType: "interactions",
    entityTypeDisplay: "AI Interactions",
    retentionDays: 365,
    minimumRetentionDays: 30,
    expirationAction: "anonymize",
    expirationActionDisplay: "Anonymize / Pseudonymize",
    complianceRequirement: "gdpr",
    complianceRequirementDisplay: "GDPR (Right to Erasure)",
    enabled: false,
    priority: 5,
  },
];

export const longRetentionPolicies: RetentionPolicy[] = [
  {
    ...retentionPolicies[0],
    id: "r-9",
    name: LONG,
    description: LONG,
    retentionDays: 36500,
  },
  ...retentionPolicies,
];

// settings/runtime

export const runtime: RuntimeSnapshot = {
  settings: {
    assistant_provider: "lmstudio",
    assistant_model: "qwen3-32b-instruct",
    assistant_allowed_topics: ["governance", "policies", "incidents"],
    policy_copilot_enabled: true,
    content_capture_mode: "redacted",
    taxonomy_extensions: ["project:phoenix", "client:acme"],
    control_approval_required: true,
    discovery_refresh_seconds: 3600,
    model_visibility: "enabled_only",
    default_rate_limit_per_minute: 120,
    default_budget_cents: 50000,
  },
  revision: 7,
  revisions: [
    { revision: 7, actor_name: "Leo Mata", created_at: "2026-10-15T16:20:00Z" },
    {
      revision: 6,
      actor_name: "Priya Shah",
      created_at: "2026-10-09T11:02:00Z",
    },
    { revision: 5, actor_id: "u-118", created_at: "2026-10-01T08:45:00Z" },
  ],
  pending: [
    {
      id: "c-4e1a",
      status: "staged",
      settings: { default_rate_limit_per_minute: 240 },
      base_revision: 7,
      created_by: "priya@acme.example",
      approved_by: "",
      applied_revision: null,
      created_at: "2026-10-16T09:10:00Z",
      updated_at: "2026-10-16T09:10:00Z",
    },
    {
      id: "c-9b07",
      status: "approved",
      settings: {
        assistant_model: "qwen3-32b-instruct-q8",
        assistant_allowed_topics: ["governance", "policies"],
      },
      base_revision: 7,
      created_by: "leo@calliope.ai",
      approved_by: "priya@acme.example",
      applied_revision: null,
      created_at: "2026-10-16T10:00:00Z",
      updated_at: "2026-10-16T10:30:00Z",
    },
  ],
  effective: {
    assistant_provider: {
      source: "tenant",
      changed_at: "2026-10-01T08:45:00Z",
      changed_by: { id: "u-118" },
    },
    assistant_model: {
      source: "tenant",
      changed_at: "2026-10-15T16:20:00Z",
      changed_by: { name: "Leo Mata" },
    },
    content_capture_mode: {
      source: "tenant",
      changed_at: "2026-10-09T11:02:00Z",
      changed_by: { name: "Priya Shah" },
    },
    discovery_refresh_seconds: {
      source: "default",
      changed_at: null,
      changed_by: null,
    },
    model_visibility: { source: "default", changed_at: null, changed_by: null },
  },
};

/** A tenant on the defaults: no revision, nothing pending. */
export const defaultRuntime: RuntimeSnapshot = {
  settings: {
    assistant_provider: "",
    assistant_model: "",
    assistant_allowed_topics: [],
    policy_copilot_enabled: false,
    content_capture_mode: "metadata",
    taxonomy_extensions: [],
    control_approval_required: false,
    discovery_refresh_seconds: 3600,
    model_visibility: "enabled_only",
    default_rate_limit_per_minute: 60,
    default_budget_cents: 0,
  },
  revision: 0,
  revisions: [],
  pending: [],
  effective: {},
};

export const longRuntime: RuntimeSnapshot = {
  ...runtime,
  settings: {
    ...runtime.settings,
    assistant_model:
      "anthropic.claude-opus-5-5-20261001-v1:0-cross-region-inference-profile-eu",
    assistant_allowed_topics: [
      "governance",
      "policies",
      "incidents",
      "risk registers",
      "compliance frameworks",
      "model usage",
      "budgets and showback",
    ],
    taxonomy_extensions: Array.from(
      { length: 12 },
      (_, i) => `cost-centre:research-division-${i + 1}`,
    ),
  },
};

// settings/astrolift

export const astroliftInstalls: AstroliftInstall[] = [
  {
    id: "i-1",
    name: "astrolift-prod",
    base_url: "https://astrolift.acme.example",
    status: "connected",
    tenant_ids: ["t-acme"],
    connected_at: "2026-09-20T12:00:00Z",
    last_used_at: "2026-10-16T14:01:00Z",
    clusters: [
      {
        id: "k-1",
        cluster_id: "eks-prod-use1",
        provider: "aws",
        region: "us-east-1",
        status: "active",
        health: "healthy",
        last_seen_at: "2026-10-16T14:04:00Z",
        gateway_version: "0.9.3",
        tenant_ids: ["t-acme"],
        revoked_at: null,
      },
      {
        id: "k-2",
        cluster_id: "gke-eu-west4",
        provider: "gcp",
        region: "europe-west4",
        status: "stale",
        health: "degraded",
        last_seen_at: "2026-10-15T22:10:00Z",
        gateway_version: "0.9.1",
        tenant_ids: ["t-acme"],
        revoked_at: null,
      },
    ],
  },
  {
    id: "i-2",
    name: "astrolift-lab",
    base_url: "https://lab.astrolift.acme.example",
    status: "connected",
    tenant_ids: [],
    connected_at: "2026-10-14T09:00:00Z",
    last_used_at: null,
    clusters: [],
  },
];

export const longAstroliftInstalls: AstroliftInstall[] = [
  {
    ...astroliftInstalls[0],
    id: "i-9",
    name: "astrolift-acme-robotics-holdings-international-applied-autonomy-production",
    base_url:
      "https://astrolift.internal.acme-robotics-holdings-international.example/tenants/applied-autonomy/production",
    tenant_ids: [
      "t-acme",
      "t-acme-research",
      "t-acme-emea",
      "t-acme-apac",
      "t-acme-safety",
    ],
    clusters: astroliftInstalls[0].clusters.map((c) => ({
      ...c,
      id: `${c.id}-long`,
      cluster_id: `${c.cluster_id}-acme-robotics-applied-autonomy-research-pool-a`,
    })),
  },
  { ...astroliftInstalls[1], status: "disconnected" },
];

export const enrollmentCode: EnrollmentCode = {
  code: "ZNT-ENR-7F3C-2A91-B04E",
  expires_at: "2026-10-16T15:00:00Z",
};
