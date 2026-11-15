/**
 * Activity states on the five status tones, once (StatusBadge's rule). The
 * values are the backend's choices: ComplianceAlert.Status, Incident.Status
 * and Severity, Event.Status, and the audit record's status.
 */
import type { StatusTone } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { NotificationKind } from "@/graphql/notifications/types";

import { humanize } from "../../shared/format";

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

/** Severity values, most severe first; named by `activity.severities`. */
export const ALERT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const;

export const INCIDENT_SEVERITIES = ALERT_SEVERITIES.slice(0, 4);

/** ComplianceAlert.AlertType; named by `activity.alertTypes`. */
export const ALERT_TYPES = [
  "single_violation",
  "repeated_violations",
  "threshold_exceeded",
  "anomaly_detected",
  "critical_violation",
  "compliance_drift",
  "violation_spike",
  "policy_health",
  "repeat_violations",
] as const;

/** Incident.Status; named by `activity.incidentStatuses`. */
export const INCIDENT_STATUSES = [
  "open",
  "investigating",
  "mitigating",
  "resolved",
  "closed",
] as const;

/** Incident.IncidentType; named by `activity.incidentTypes`. */
export const INCIDENT_TYPES = [
  "policy_violation",
  "security_breach",
  "data_leak",
  "service_disruption",
  "compliance_breach",
  "cost_overrun",
  "harmful_output",
  "other",
] as const;

/** Event.EventCategory; named by `activity.eventCategories`. */
export const EVENT_CATEGORIES = ["telemetry", "audit", "alert"] as const;

/**
 * Event.EventType in backend/zentinelle/models/event.py, named by
 * `activity.eventTypes`. SDKs may send others.
 */
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
] as const;

/**
 * The area's value names in the reader's language, and the options its
 * filters offer. A value the catalog does not name reads as its words.
 */
export function useActivityLabels() {
  const t = useTranslations("activity");
  const name = (group: string, value: string | null | undefined) =>
    value && t.has(`${group}.${value}`)
      ? t(`${group}.${value}`)
      : humanize(value);
  const options = (group: string, values: readonly string[]) =>
    values.map((value) => ({ value, label: t(`${group}.${value}`) }));
  return {
    name,
    eventType: (value: string) => name("eventTypes", value),
    eventCategory: (value: string) => name("eventCategories", value),
    eventStatus: (value: string) => name("eventStatuses", value),
    auditStatus: (value: string) => name("auditStatuses", value),
    sla: (value: string) => name("sla", value),
    alertSeverities: options("severities", ALERT_SEVERITIES),
    incidentSeverities: options("severities", INCIDENT_SEVERITIES),
    alertTypes: options("alertTypes", ALERT_TYPES),
    incidentStatuses: options("incidentStatuses", INCIDENT_STATUSES),
    incidentTypes: options("incidentTypes", INCIDENT_TYPES),
    eventCategories: options("eventCategories", EVENT_CATEGORIES),
    eventTypes: options("eventTypes", EVENT_TYPES),
  };
}
