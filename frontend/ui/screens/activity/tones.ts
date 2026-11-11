/**
 * Activity states on the five status tones, once (StatusBadge's rule). The
 * values are the backend's choices: ComplianceAlert.Status, Incident.Status
 * and Severity, Event.Status, and the audit record's status.
 */
import type { StatusTone } from "@calliopelabs/ui";

import type { NotificationKind } from "@/graphql/notifications/types";

export const SEVERITY_TONE: Record<string, StatusTone> = {
  critical: "error",
  high: "error",
  medium: "warn",
  low: "info",
  info: "muted",
};

export const ALERT_STATUS_TONE: Record<string, StatusTone> = {
  open: "error",
  acknowledged: "warn",
  investigating: "warn",
  resolved: "ok",
  false_positive: "muted",
  dismissed: "muted",
};

export const INCIDENT_STATUS_TONE: Record<string, StatusTone> = {
  open: "error",
  investigating: "warn",
  mitigating: "info",
  resolved: "ok",
  closed: "muted",
};

export const SLA_TONE: Record<string, StatusTone> = {
  on_track: "ok",
  met: "ok",
  at_risk: "warn",
  breached: "error",
};

export const EVENT_STATUS_TONE: Record<string, StatusTone> = {
  pending: "info",
  processing: "info",
  processed: "ok",
  failed: "error",
};

export const AUDIT_STATUS_TONE: Record<string, StatusTone> = {
  success: "ok",
  failure: "error",
  denied: "error",
};

/** The tone of a value, muted when the backend sends one the table does not know. */
export function toneOf(
  map: Record<string, StatusTone>,
  value: string | null | undefined,
): StatusTone {
  return (value && map[value.toLowerCase()]) || "muted";
}

/** Notifications carry no severity; the type stands in for one (as the bell did). */
export function notificationTone(type: NotificationKind): StatusTone {
  switch (type) {
    case "incident_opened":
    case "policy_violation":
      return "error";
    case "high_risk":
    case "budget_warning":
      return "warn";
    default:
      return "info";
  }
}

export const ALERT_SEVERITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "info", label: "Info" },
] as const;

export const INCIDENT_SEVERITIES = ALERT_SEVERITIES.slice(0, 4);

export const ALERT_TYPES = [
  { value: "single_violation", label: "Single violation" },
  { value: "repeated_violations", label: "Repeated violations" },
  { value: "threshold_exceeded", label: "Threshold exceeded" },
  { value: "anomaly_detected", label: "Anomaly detected" },
  { value: "critical_violation", label: "Critical violation" },
  { value: "compliance_drift", label: "Compliance drift" },
  { value: "violation_spike", label: "Violation rate spike" },
  { value: "policy_health", label: "Policy health issue" },
  { value: "repeat_violations", label: "Repeat violations by user" },
] as const;

export const INCIDENT_STATUSES = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "mitigating", label: "Mitigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

export const INCIDENT_TYPES = [
  { value: "policy_violation", label: "Policy violation" },
  { value: "security_breach", label: "Security breach" },
  { value: "data_leak", label: "Data leak" },
  { value: "service_disruption", label: "Service disruption" },
  { value: "compliance_breach", label: "Compliance breach" },
  { value: "cost_overrun", label: "Cost overrun" },
  { value: "harmful_output", label: "Harmful output" },
  { value: "other", label: "Other" },
] as const;

export const EVENT_CATEGORIES = [
  { value: "telemetry", label: "Telemetry" },
  { value: "audit", label: "Audit" },
  { value: "alert", label: "Alert" },
] as const;

/** Event.EventType in backend/zentinelle/models/event.py. SDKs may send others. */
export const EVENT_TYPES = [
  "heartbeat",
  "metrics",
  "usage",
  "spawn",
  "stop",
  "login",
  "logout",
  "config_change",
  "secret_access",
  "ai_request",
  "ai_response",
  "tool_call",
  "policy_violation",
  "budget_exceeded",
  "endpoint_unhealthy",
  "security_threat",
  "error",
].map((value) => ({
  value,
  label: value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
}));
