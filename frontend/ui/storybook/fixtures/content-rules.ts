/**
 * Content rules and their detections: `GetContentRules`
 * (graphql/content-rules/queries.ts), `GetContentViolations` and
 * `GetContentScans` (graphql/content-scanner/queries.ts).
 */
import { GET_CONTENT_RULES } from "@/graphql/content-rules/queries";
import type {
  ContentRuleData,
  ContentRuleListData,
  TestContentRulePayload,
} from "@/graphql/content-rules/types";
import {
  GET_CONTENT_SCANS,
  GET_CONTENT_VIOLATIONS,
} from "@/graphql/content-scanner/queries";
import type {
  ContentScanData,
  ContentScansData,
  ContentViolationData,
  ContentViolationsData,
} from "@/graphql/content-scanner/types";

import { mockError, mockLoading, mockQuery } from "../graphql";

function rule(
  overrides: Partial<ContentRuleData> &
    Pick<ContentRuleData, "id" | "name" | "ruleType">,
): ContentRuleData {
  return {
    description: "",
    ruleTypeDisplay: null,
    config: {},
    severity: "high",
    severityDisplay: "High",
    enforcement: "enforce",
    enforcementDisplay: "Enforce",
    action: "block",
    actionDisplay: "Block",
    blockLevel: "turn",
    steerMessage: "",
    escalation: null,
    scanMode: "realtime",
    scanInput: true,
    scanOutput: true,
    scanContext: false,
    scopeType: "organization",
    scopeName: null,
    priority: 100,
    enabled: true,
    notifyUser: false,
    notifyAdmins: true,
    webhookUrl: "",
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-10-14T09:12:00Z",
    violationCount: 0,
    ...overrides,
  };
}

export const contentRules: ContentRuleData[] = [
  rule({
    id: "cr-secrets",
    name: "Cloud credentials",
    ruleType: "secret_detection",
    ruleTypeDisplay: "Secret/Credential Detection",
    severity: "critical",
    severityDisplay: "Critical",
    violationCount: 14,
    description: "AWS, GCP and Azure keys in prompts or answers.",
  }),
  rule({
    id: "cr-pii",
    name: "Customer PII",
    ruleType: "pii_detection",
    ruleTypeDisplay: "PII Detection",
    action: "redact",
    actionDisplay: "Redact",
    violationCount: 203,
  }),
  rule({
    id: "cr-injection",
    name: "Prompt injection",
    ruleType: "prompt_injection",
    ruleTypeDisplay: "Prompt Injection Detection",
    scanOutput: false,
    violationCount: 9,
  }),
  rule({
    id: "cr-keywords",
    name: "Competitor names",
    ruleType: "keyword_block",
    ruleTypeDisplay: "Keyword Blocklist",
    severity: "low",
    severityDisplay: "Low",
    action: "warn",
    actionDisplay: "Warn",
    enforcement: "audit",
    enforcementDisplay: "Audit Only",
    config: { keywords: ["acme", "globex"] },
  }),
  rule({
    id: "cr-off",
    name: "Profanity",
    ruleType: "profanity_filter",
    ruleTypeDisplay: "Profanity Filter",
    severity: "medium",
    severityDisplay: "Medium",
    enabled: false,
    violationCount: null,
  }),
];

export const longRule = rule({
  id: "cr-long",
  name: "A custom regular expression for internal ticket identifiers, project code names and customer account numbers",
  ruleType: "custom_pattern",
  ruleTypeDisplay: "Custom Pattern (Regex)",
  description:
    "Matches the internal formats the support team must never paste into a model, across every region and every product line, including the legacy formats from before the 2024 migration.",
  config: { pattern: "(TCK|PRJ|ACC)-[A-Z]{2,4}-\\d{6,10}" },
  scopeType: "deployment",
  scopeName:
    "customer-support-refunds-and-billing-escalation-eu-west-1-production",
  violationCount: 128_441,
});

export const manyRules: ContentRuleData[] = [
  ...contentRules,
  longRule,
  ...Array.from({ length: 30 }, (_, i) =>
    rule({
      id: `cr-gen-${i}`,
      name: `Keyword list ${i + 1}`,
      ruleType: "keyword_block",
      severity: "low",
      severityDisplay: "Low",
    }),
  ),
];

function violation(
  overrides: Partial<ContentViolationData> &
    Pick<ContentViolationData, "id" | "ruleType">,
): ContentViolationData {
  return {
    ruleTypeDisplay: null,
    severity: "high",
    severityDisplay: "High",
    enforcement: "enforce",
    matchedPattern: null,
    matchedText: null,
    matchStart: null,
    matchEnd: null,
    confidence: 0.98,
    category: null,
    wasBlocked: true,
    wasRedacted: false,
    userNotified: false,
    adminNotified: true,
    createdAt: "2026-10-16T13:40:00Z",
    ruleName: null,
    ...overrides,
  };
}

export const violations: ContentViolationData[] = [
  violation({
    id: "v-1",
    ruleType: "secret_detection",
    ruleTypeDisplay: "Secret/Credential Detection",
    ruleName: "Cloud credentials",
    severity: "critical",
    severityDisplay: "Critical",
    matchedText: "AKIA****************",
    category: "aws_access_key",
  }),
  violation({
    id: "v-2",
    ruleType: "pii_detection",
    ruleTypeDisplay: "PII Detection",
    ruleName: "Customer PII",
    wasBlocked: false,
    wasRedacted: true,
    matchedText: "***-**-6789",
    category: "ssn",
    createdAt: "2026-10-16T12:05:00Z",
  }),
  violation({
    id: "v-3",
    ruleType: "prompt_injection",
    ruleTypeDisplay: "Prompt Injection Detection",
    ruleName: "Prompt injection",
    matchedText: "Ignore all previous instructions and",
    confidence: 0.87,
    createdAt: "2026-10-16T09:30:00Z",
  }),
  violation({
    id: "v-4",
    ruleType: "keyword_block",
    ruleTypeDisplay: "Keyword Blocklist",
    ruleName: "Competitor names",
    severity: "low",
    severityDisplay: "Low",
    enforcement: "audit",
    wasBlocked: false,
    matchedText: "acme",
    createdAt: "2026-10-15T17:00:00Z",
  }),
];

export const manyViolations: ContentViolationData[] = [
  ...violations,
  violation({
    id: "v-long",
    ruleType: "custom_pattern",
    ruleName: longRule.name,
    matchedText: "TCK-EUW-0012345678 ".repeat(8),
  }),
  ...Array.from({ length: 40 }, (_, i) =>
    violation({
      id: `v-gen-${i}`,
      ruleType: "pii_detection",
      ruleName: "Customer PII",
      wasBlocked: false,
      wasRedacted: true,
      matchedText: "***@example.com",
    }),
  ),
];

function scan(
  overrides: Partial<ContentScanData> & Pick<ContentScanData, "id">,
): ContentScanData {
  return {
    contentType: "user_input",
    contentTypeDisplay: "User Input/Prompt",
    statusDisplay: "Completed",
    hasViolations: false,
    violationCount: 0,
    maxSeverity: null,
    actionTaken: null,
    wasBlocked: false,
    wasRedacted: false,
    userIdentifier: "user-42",
    endpointName: "support-bot",
    createdAt: "2026-10-16T13:40:00Z",
    ...overrides,
  };
}

export const scans: ContentScanData[] = [
  scan({
    id: "s-1",
    hasViolations: true,
    violationCount: 1,
    maxSeverity: "critical",
    wasBlocked: true,
  }),
  scan({
    id: "s-2",
    hasViolations: true,
    violationCount: 1,
    maxSeverity: "high",
    wasRedacted: true,
    contentType: "ai_output",
    contentTypeDisplay: "AI Response",
  }),
  ...Array.from({ length: 18 }, (_, i) => scan({ id: `s-ok-${i}` })),
];

export const ruleTestMatch: TestContentRulePayload = {
  success: true,
  matched: true,
  matches: [
    { pattern: "AKIA[0-9A-Z]{16}", text: "AKIAABCDEFGHIJKLMNOP", position: 18 },
  ],
  errors: [],
};

export const ruleTestNoMatch: TestContentRulePayload = {
  success: true,
  matched: false,
  matches: [],
  errors: [],
};

export const contentRulesMocks = {
  full: [
    mockQuery(GET_CONTENT_RULES, {
      contentRules,
    } satisfies ContentRuleListData),
  ],
  empty: [
    mockQuery(GET_CONTENT_RULES, {
      contentRules: [],
    } satisfies ContentRuleListData),
  ],
  loading: [mockLoading(GET_CONTENT_RULES)],
  error: [mockError(GET_CONTENT_RULES)],
};

export const detectionsMocks = {
  full: [
    mockQuery(GET_CONTENT_VIOLATIONS, {
      contentViolations: violations,
    } satisfies ContentViolationsData),
    mockQuery(GET_CONTENT_SCANS, {
      contentScans: scans,
    } satisfies ContentScansData),
  ],
  empty: [
    mockQuery(GET_CONTENT_VIOLATIONS, {
      contentViolations: [],
    } satisfies ContentViolationsData),
    mockQuery(GET_CONTENT_SCANS, {
      contentScans: [],
    } satisfies ContentScansData),
  ],
  loading: [
    mockLoading(GET_CONTENT_VIOLATIONS),
    mockLoading(GET_CONTENT_SCANS),
  ],
  error: [mockError(GET_CONTENT_VIOLATIONS), mockError(GET_CONTENT_SCANS)],
};
