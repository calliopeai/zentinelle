/**
 * The Activity area's data, as the app's own operations return it:
 * `ComplianceAlerts` (graphql/alerts), `Notifications` and
 * `UnreadNotifications` (graphql/notifications), `GetIncidents`
 * (graphql/risks), `GetEvents` and `GetAuditLogs` (graphql/events). Each
 * fixture holds only the fields its query selects.
 *
 * Incident comments have no GraphQL operation; they come from REST
 * `incidents/{id}/comments/`, typed in ui/screens/activity/types.ts from the
 * backend serializer.
 */
import { GET_COMPLIANCE_ALERTS } from "@/graphql/alerts/queries";
import type {
  ComplianceAlertData,
  ComplianceAlertsData,
} from "@/graphql/alerts/types";
import { GET_AUDIT_LOGS, GET_EVENTS } from "@/graphql/events/queries";
import type {
  AuditLogData,
  AuditLogListData,
  EventData,
  EventListData,
} from "@/graphql/events/types";
import {
  GET_NOTIFICATIONS,
  GET_UNREAD_NOTIFICATIONS,
} from "@/graphql/notifications/queries";
import type {
  NotificationData,
  NotificationsData,
  UnreadNotificationsData,
} from "@/graphql/notifications/types";
import { GET_INCIDENTS } from "@/graphql/risks/queries";
import type { IncidentData, IncidentListData } from "@/graphql/risks/types";

import type { IncidentComment } from "../../screens/activity/types";
import { mockError, mockLoading, mockQuery } from "../graphql";

const LONG =
  "A retrieval tool returned a customer record that belongs to another tenant, because the vector index is shared by two deployments meant to be isolated and the tenant filter runs after ranking instead of before it.";

// ---------------------------------------------------------------- alerts

function alert(
  o: Partial<ComplianceAlertData> & Pick<ComplianceAlertData, "id" | "title">,
): ComplianceAlertData {
  return {
    alertType: "single_violation",
    severity: "medium",
    description: "",
    userIdentifier: null,
    violationCount: 1,
    firstViolationAt: "2026-10-16T13:40:00Z",
    lastViolationAt: "2026-10-16T13:40:00Z",
    status: "open",
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    metadata: null,
    createdAt: "2026-10-16T13:40:05Z",
    alertTypeDisplay: "Single Violation",
    severityDisplay: "Medium",
    statusDisplay: "Open",
    endpointName: "support-bot",
    acknowledgedByUsername: null,
    resolvedByUsername: null,
    ...o,
  };
}

export const alerts: ComplianceAlertData[] = [
  alert({
    id: "al-1",
    title: "PII in model output",
    description:
      "An email address and a phone number left support-bot unredacted.",
    alertType: "critical_violation",
    alertTypeDisplay: "Critical Violation",
    severity: "critical",
    severityDisplay: "Critical",
    userIdentifier: "dana@acme.example",
    violationCount: 3,
    firstViolationAt: "2026-10-16T12:58:00Z",
    lastViolationAt: "2026-10-16T14:02:00Z",
  }),
  alert({
    id: "al-2",
    title: "Jailbreak attempts repeat",
    description: "Seven prompt-injection attempts from one user in an hour.",
    alertType: "repeat_violations",
    alertTypeDisplay: "Repeat Violations by User",
    severity: "high",
    severityDisplay: "High",
    userIdentifier: "user-4411",
    violationCount: 7,
    endpointName: "triage-agent",
    status: "acknowledged",
    statusDisplay: "Acknowledged",
    acknowledgedAt: "2026-10-16T13:50:00Z",
    acknowledgedByUsername: "leo",
  }),
  alert({
    id: "al-3",
    title: "Spend over 80% of the monthly budget",
    alertType: "threshold_exceeded",
    alertTypeDisplay: "Threshold Exceeded",
    severity: "medium",
    endpointName: "nightly-sync",
    violationCount: null,
  }),
  alert({
    id: "al-4",
    title: "Toxicity score drift",
    alertType: "compliance_drift",
    alertTypeDisplay: "Compliance Drift",
    severity: "low",
    severityDisplay: "Low",
    status: "resolved",
    statusDisplay: "Resolved",
    resolvedAt: "2026-10-15T18:00:00Z",
    resolvedByUsername: "leo",
    resolutionNotes: "Threshold retuned after the model upgrade.",
    endpointName: null,
  }),
];

export const longAlerts: ComplianceAlertData[] = [
  alert({
    id: "al-long",
    title:
      "Repeated disclosure of internal system prompt fragments to anonymous users across three regions",
    description: LONG,
    alertType: "violation_spike",
    alertTypeDisplay: "Violation Rate Spike",
    severity: "critical",
    severityDisplay: "Critical",
    userIdentifier: "anonymous-session-7f3c2a91d4e5b6a7c8d9e0f1a2b3c4d5",
    violationCount: 12840,
    endpointName: "customer-support-retrieval-agent-eu-west-1-canary",
  }),
  ...Array.from({ length: 40 }, (_, i) =>
    alert({ id: `al-bulk-${i}`, title: `Blocked output ${i + 1}` }),
  ),
];

const openAlerts = alerts.filter((a) => a.status === "open");

export const alertsMocks = {
  /** Answers by the `status` variable, as the server filters. */
  full: [
    mockQuery(
      GET_COMPLIANCE_ALERTS,
      { complianceAlerts: openAlerts } satisfies ComplianceAlertsData,
      { variables: (v: { status?: string | null }) => v.status === "open" },
    ),
    mockQuery(GET_COMPLIANCE_ALERTS, {
      complianceAlerts: alerts,
    } satisfies ComplianceAlertsData),
  ],
  empty: [
    mockQuery(GET_COMPLIANCE_ALERTS, {
      complianceAlerts: [],
    } satisfies ComplianceAlertsData),
  ],
  loading: [mockLoading(GET_COMPLIANCE_ALERTS)],
  error: [mockError(GET_COMPLIANCE_ALERTS)],
};

// --------------------------------------------------------- notifications

function notification(
  o: Partial<NotificationData> & Pick<NotificationData, "id" | "subject">,
): NotificationData {
  return {
    type: "policy_violation",
    message: "",
    status: "UNREAD",
    statusDate: null,
    metadata: null,
    createdAt: "2026-10-16T14:02:00Z",
    ...o,
  };
}

export const notifications: NotificationData[] = [
  notification({
    id: "n-1",
    type: "incident_opened",
    subject: "Incident opened: PII in model output",
    message: "support-bot leaked contact details; you are the assignee.",
    metadata: { incidentId: "inc-1" },
  }),
  notification({
    id: "n-2",
    type: "budget_warning",
    subject: "nightly-sync is at 82% of its monthly budget",
    message: "",
    createdAt: "2026-10-16T09:00:00Z",
  }),
  notification({
    id: "n-3",
    type: "high_risk",
    subject: "Risk raised to high: prompt injection",
    status: "READ",
    statusDate: "2026-10-15T17:00:00Z",
    createdAt: "2026-10-15T16:30:00Z",
    metadata: { riskId: "risk-9" },
  }),
];

export const longNotifications: NotificationData[] = [
  notification({
    id: "n-long",
    type: "policy_violation",
    subject:
      "Policy violation on customer-support-retrieval-agent-eu-west-1-canary: output filter blocked a response that quoted an internal runbook",
    message: LONG,
  }),
  ...Array.from({ length: 30 }, (_, i) =>
    notification({
      id: `n-bulk-${i}`,
      subject: `Blocked output ${i + 1}`,
      status: i % 2 ? "READ" : "UNREAD",
    }),
  ),
];

export const notificationsMocks = {
  full: [
    mockQuery(GET_NOTIFICATIONS, {
      notifications,
    } satisfies NotificationsData),
    mockQuery(GET_UNREAD_NOTIFICATIONS, {
      notifications: notifications
        .filter((n) => n.status === "UNREAD")
        .map(({ id, status }) => ({ id, status })),
    } satisfies UnreadNotificationsData),
  ],
  empty: [
    mockQuery(GET_NOTIFICATIONS, {
      notifications: [],
    } satisfies NotificationsData),
    mockQuery(GET_UNREAD_NOTIFICATIONS, {
      notifications: [],
    } satisfies UnreadNotificationsData),
  ],
  loading: [
    mockLoading(GET_NOTIFICATIONS),
    mockLoading(GET_UNREAD_NOTIFICATIONS),
  ],
  error: [mockError(GET_NOTIFICATIONS), mockError(GET_UNREAD_NOTIFICATIONS)],
};

// ------------------------------------------------------------- incidents

// IncidentData (graphql/risks/types.ts) is wider than INCIDENT_FIELDS: the
// query does not select remediationActions, lessonsLearned or
// deploymentName, so the fixture leaves them out.
type SelectedIncident = Omit<
  IncidentData,
  "remediationActions" | "lessonsLearned" | "deploymentName"
>;

function incident(
  o: Partial<SelectedIncident> & Pick<SelectedIncident, "id" | "title">,
): IncidentData {
  return {
    description: "",
    incidentType: "policy_violation",
    severity: "medium",
    status: "open",
    affectedUser: null,
    affectedUserCount: null,
    rootCause: null,
    impactAssessment: null,
    resolution: null,
    occurredAt: "2026-10-16T13:58:00Z",
    detectedAt: "2026-10-16T14:01:00Z",
    acknowledgedAt: null,
    resolvedAt: null,
    closedAt: null,
    tags: [],
    createdAt: "2026-10-16T14:01:00Z",
    updatedAt: "2026-10-16T14:01:00Z",
    incidentTypeDisplay: "Policy Violation",
    severityDisplay: "Medium",
    statusDisplay: "Open",
    slaStatus: "on_track",
    timeToAcknowledgeSeconds: null,
    timeToResolveSeconds: null,
    assignedToName: null,
    reportedByName: null,
    endpointName: "support-bot",
    relatedRiskName: null,
    triggeringPolicyName: null,
    ...o,
  } as SelectedIncident as IncidentData;
}

export const incidents: IncidentData[] = [
  incident({
    id: "inc-1",
    title: "PII in model output",
    description:
      "support-bot returned a customer's email address and phone number to another customer.",
    incidentType: "data_leak",
    incidentTypeDisplay: "Data Leak",
    severity: "critical",
    severityDisplay: "Critical",
    status: "investigating",
    statusDisplay: "Investigating",
    affectedUser: "dana@acme.example",
    affectedUserCount: 1,
    acknowledgedAt: "2026-10-16T14:05:10Z",
    timeToAcknowledgeSeconds: 250,
    assignedToName: "Leo Mata",
    reportedByName: "Zentinelle AI",
    triggeringPolicyName: "Redact PII in outputs",
    relatedRiskName: "Cross-tenant retrieval",
    slaStatus: "at_risk",
    tags: ["pii", "retrieval"],
  }),
  incident({
    id: "inc-2",
    title: "Budget overrun on nightly-sync",
    incidentType: "cost_overrun",
    incidentTypeDisplay: "Cost Overrun",
    severity: "high",
    severityDisplay: "High",
    endpointName: "nightly-sync",
    triggeringPolicyName: "Monthly budget: batch agents",
  }),
  incident({
    id: "inc-3",
    title: "Harmful output flagged by a reviewer",
    incidentType: "harmful_output",
    incidentTypeDisplay: "Harmful Output",
    severity: "low",
    severityDisplay: "Low",
    status: "resolved",
    statusDisplay: "Resolved",
    acknowledgedAt: "2026-10-14T10:03:00Z",
    resolvedAt: "2026-10-14T12:00:00Z",
    timeToAcknowledgeSeconds: 180,
    timeToResolveSeconds: 7200,
    rootCause: "A stale system prompt allowed sarcasm.",
    resolution: "Rolled the prompt back to version 12.",
    occurredAt: "2026-10-14T10:00:00Z",
    detectedAt: "2026-10-14T10:00:00Z",
    assignedToName: "Leo Mata",
    reportedByName: "Leo Mata",
    slaStatus: "met",
  }),
];

export const longIncidents: IncidentData[] = [
  incident({
    id: "inc-long",
    title:
      "Repeated disclosure of internal system prompt fragments to anonymous users across three regions after the canary rollout",
    description: LONG,
    incidentType: "security_breach",
    incidentTypeDisplay: "Security Breach",
    severity: "critical",
    severityDisplay: "Critical",
    endpointName: "customer-support-retrieval-agent-eu-west-1-canary",
    affectedUserCount: 128440,
    rootCause: LONG,
    impactAssessment: LONG,
    triggeringPolicyName:
      "Block system prompt disclosure in every region and every deployment tier",
    tags: [
      "prompt-injection",
      "multi-region",
      "canary",
      "customer-facing",
      "sev-1",
    ],
    slaStatus: "breached",
  }),
  ...Array.from({ length: 30 }, (_, i) =>
    incident({ id: `inc-bulk-${i}`, title: `Blocked output ${i + 1}` }),
  ),
];

export const incidentsMocks = {
  full: [mockQuery(GET_INCIDENTS, { incidents } satisfies IncidentListData)],
  empty: [
    mockQuery(GET_INCIDENTS, { incidents: [] } satisfies IncidentListData),
  ],
  loading: [mockLoading(GET_INCIDENTS)],
  error: [mockError(GET_INCIDENTS)],
};

/** REST `incidents/{id}/comments/`, as `_serialize_comment` writes it. */
export const incidentComments: IncidentComment[] = [
  {
    id: 1,
    author_id: "7",
    body: "Rotated the support-bot key. Watching for repeats.",
    created_at: "2026-10-16T14:20:00Z",
  },
  {
    id: 2,
    author_id: "12",
    body: "Retrieval filter now runs before ranking in staging.",
    created_at: "2026-10-16T15:05:00Z",
  },
];

// ---------------------------------------------------------------- events

function event(
  o: Partial<EventData> & Pick<EventData, "id" | "eventType">,
): EventData {
  return {
    eventCategory: "telemetry",
    status: "processed",
    payload: null,
    userIdentifier: null,
    occurredAt: "2026-10-16T14:05:00Z",
    processedAt: "2026-10-16T14:05:01Z",
    correlationId: null,
    endpointName: "support-bot",
    ...o,
  };
}

export const events: EventData[] = [
  event({
    id: "ev-1",
    eventType: "ai_request",
    eventCategory: "audit",
    payload: { model: "claude-sonnet-4-5", input_tokens: 1840 },
    userIdentifier: "dana@acme.example",
    correlationId: "c0ffee00-7f3c-4d1e-9b2a-55b2c041a1d9",
  }),
  event({
    id: "ev-2",
    eventType: "policy_violation",
    eventCategory: "alert",
    payload: { policy: "Redact PII in outputs", action: "block" },
    occurredAt: "2026-10-16T14:04:30Z",
    correlationId: "c0ffee00-7f3c-4d1e-9b2a-55b2c041a1d9",
  }),
  event({
    id: "ev-3",
    eventType: "heartbeat",
    endpointName: "nightly-sync",
    occurredAt: "2026-10-16T14:03:00Z",
  }),
  event({
    id: "ev-4",
    eventType: "config_change",
    eventCategory: "audit",
    status: "failed",
    processedAt: null,
    occurredAt: "2026-10-16T14:01:00Z",
  }),
];

/** Arrive on the next poll, held behind the pill. */
export const newerEvents: EventData[] = [
  event({
    id: "ev-5",
    eventType: "ai_response",
    occurredAt: "2026-10-16T14:05:20Z",
  }),
  event({
    id: "ev-6",
    eventType: "tool_call",
    occurredAt: "2026-10-16T14:05:30Z",
    status: "pending",
    processedAt: null,
  }),
];

export const longEvents: EventData[] = [
  event({
    id: "ev-long",
    eventType: "a_custom_event_type_reported_by_an_sdk_integration",
    endpointName: "customer-support-retrieval-agent-eu-west-1-canary",
    userIdentifier: "anonymous-session-7f3c2a91d4e5b6a7c8d9e0f1a2b3c4d5",
    payload: { note: LONG, nested: { depth: { of: { the: "payload" } } } },
  }),
  ...Array.from({ length: 60 }, (_, i) =>
    event({ id: `ev-bulk-${i}`, eventType: "heartbeat" }),
  ),
];

export const eventsMocks = {
  full: [mockQuery(GET_EVENTS, { events } satisfies EventListData)],
  empty: [mockQuery(GET_EVENTS, { events: [] } satisfies EventListData)],
  loading: [mockLoading(GET_EVENTS)],
  error: [mockError(GET_EVENTS)],
};

// ------------------------------------------------------------- audit log

function audit(
  o: Partial<AuditLogData> & Pick<AuditLogData, "id" | "action">,
): AuditLogData {
  return {
    resourceType: "policy",
    resourceId: "pol-12",
    resourceName: "Redact PII in outputs",
    metadata: null,
    apiKeyPrefix: null,
    ipAddress: "203.0.113.7",
    userAgent: "Mozilla/5.0",
    timestamp: "2026-10-16T14:00:00Z",
    actor: {
      id: "7",
      email: "leo@calliope.ai",
      name: "Leo Mata",
      type: "user",
    },
    resource: "policy:pol-12",
    status: "success",
    details: null,
    changes: null,
    ...o,
  };
}

export const auditLogs: AuditLogData[] = [
  audit({
    id: "au-1",
    action: "policy.update",
    changes: [
      { field: "enforcement", oldValue: "monitor", newValue: "enforce" },
      { field: "priority", oldValue: "50", newValue: "80" },
    ],
  }),
  audit({
    id: "au-2",
    action: "api_key.create",
    resourceType: "api_key",
    resourceId: "key-3",
    resourceName: "CI deploy key",
    resource: "api_key:key-3",
    timestamp: "2026-10-16T12:30:00Z",
  }),
  audit({
    id: "au-3",
    action: "agent.suspend",
    resourceType: "endpoint",
    resourceId: "a-c041",
    resourceName: "billing-reconcile",
    resource: "endpoint:a-c041",
    actor: { id: null, email: null, name: null, type: "api_key" },
    apiKeyPrefix: "znt_live_7f3c",
    status: "failure",
    details: { reason: "agent offline" },
    timestamp: "2026-10-16T11:00:00Z",
  }),
];

export const longAuditLogs: AuditLogData[] = [
  audit({
    id: "au-long",
    action: "retention.legal_hold.release_with_a_long_action_name",
    resourceType: "legal_hold",
    resourceId: "c0ffee00-7f3c-4d1e-9b2a-55b2c041a1d9",
    resourceName:
      "Hold for the matter of Acme Corporation versus Example Industries, every agent in the EU region",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    details: { note: LONG },
    changes: [{ field: "released_reason", oldValue: null, newValue: LONG }],
  }),
  ...Array.from({ length: 40 }, (_, i) =>
    audit({ id: `au-bulk-${i}`, action: "policy.read" }),
  ),
];

export const auditLogsMocks = {
  full: [mockQuery(GET_AUDIT_LOGS, { auditLogs } satisfies AuditLogListData)],
  empty: [
    mockQuery(GET_AUDIT_LOGS, { auditLogs: [] } satisfies AuditLogListData),
  ],
  loading: [mockLoading(GET_AUDIT_LOGS)],
  error: [mockError(GET_AUDIT_LOGS)],
};
