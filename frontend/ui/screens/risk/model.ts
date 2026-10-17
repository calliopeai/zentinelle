/**
 * Risk & compliance: the shared vocabulary of its screens. Scales and tones
 * come from the backend's choices (backend/zentinelle/models/risk.py,
 * control_evidence.py, reporting.py), once, so every screen labels a value
 * the same way. Pure data and functions; no components.
 */
import {
  areaSwitcher,
  type StatusTone,
  type TabNavItem,
} from "@calliopelabs/ui";

import { navFor } from "../../product";

/** The Fibonacci scales of the FMEA assessment, highest first. */
export const LIKELIHOOD = [
  { value: 8, label: "Almost certain" },
  { value: 5, label: "Likely" },
  { value: 3, label: "Possible" },
  { value: 2, label: "Unlikely" },
  { value: 1, label: "Rare" },
] as const;

export const IMPACT = [
  { value: 1, label: "Negligible" },
  { value: 2, label: "Minor" },
  { value: 3, label: "Moderate" },
  { value: 5, label: "Major" },
  { value: 8, label: "Severe" },
] as const;

export const RISK_CATEGORIES = [
  { value: "security", label: "Security" },
  { value: "privacy", label: "Privacy" },
  { value: "compliance", label: "Compliance" },
  { value: "operational", label: "Operational" },
  { value: "reputational", label: "Reputational" },
  { value: "financial", label: "Financial" },
  { value: "ethical", label: "Ethical" },
] as const;

export const RISK_STATUSES = [
  { value: "identified", label: "Identified" },
  { value: "assessed", label: "Assessed" },
  { value: "mitigating", label: "Mitigating" },
  { value: "accepted", label: "Accepted" },
  { value: "transferred", label: "Transferred" },
  { value: "closed", label: "Closed" },
] as const;

export const RISK_LEVELS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export const RISK_LEVEL_TONE: Record<string, StatusTone> = {
  critical: "error",
  high: "error",
  medium: "warn",
  low: "ok",
};

export const RISK_STATUS_TONE: Record<string, StatusTone> = {
  identified: "info",
  assessed: "info",
  mitigating: "warn",
  accepted: "muted",
  transferred: "muted",
  closed: "ok",
};

export function labelOf(
  scale: readonly { value: string | number; label: string }[],
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  return scale.find((item) => item.value === value)?.label ?? String(value);
}

/** ControlEvidence.Status: only `verified-operating` is operating evidence. */
export const EVIDENCE_TONE: Record<string, StatusTone> = {
  "verified-operating": "ok",
  "observation-only": "info",
  stale: "warn",
  failed: "error",
  unknown: "muted",
  unverified: "muted",
  unsupported: "muted",
};

export const EVIDENCE_LABEL: Record<string, string> = {
  "verified-operating": "Verified operating",
  "observation-only": "Observation only",
  stale: "Stale",
  failed: "Failed",
  unknown: "Unknown",
  unverified: "Unverified",
  unsupported: "Unsupported",
};

/** Report and assessment states, as the compliance and report jobs name them. */
export const REPORT_TONE: Record<string, StatusTone> = {
  completed: "ok",
  ready: "ok",
  pending: "info",
  running: "info",
  generating: "info",
  failed: "error",
};

export const IN_FLIGHT_REPORT = new Set(["pending", "running", "generating"]);

/** A date as the console prints it: day, month and year, in the reader's locale. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/** The crumb of a page in this area, read from the same model as the sidebar. */
export function areaCrumb(fn: string, capabilities: readonly string[]) {
  return areaSwitcher(navFor(capabilities), "risk", fn);
}

/** A row of tabs, the current one marked. */
export function tabsOf(
  tabs: readonly { key: string; label: string; href: string }[],
  active: string,
): TabNavItem[] {
  return tabs.map((tab) => ({ ...tab, active: tab.key === active }));
}

export const RISKS_TABS = [
  { key: "register", label: "Register", href: "/risks" },
  { key: "overview", label: "Overview", href: "/risks/overview" },
] as const;

export const COMPLIANCE_TABS = [
  { key: "frameworks", label: "Frameworks", href: "/compliance" },
  { key: "gaps", label: "Gaps", href: "/compliance/gaps" },
] as const;

export const EVIDENCE_TABS = [
  { key: "coverage", label: "Coverage", href: "/evidence" },
  { key: "atlas", label: "MITRE ATLAS", href: "/evidence/atlas" },
  { key: "brocs", label: "BROCS", href: "/evidence/brocs" },
] as const;

/** What a screen knows about the query behind it. */
export interface QueryState {
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
}

export const canMutate = (capabilities: readonly string[]) =>
  capabilities.includes("mutate");
export const isAdmin = (capabilities: readonly string[]) =>
  capabilities.includes("admin");

/** A framework's page: its backend id, as `frameworkCoverage` names it. */
export const frameworkHref = (id: string) =>
  `/compliance/${encodeURIComponent(id)}`;

/** Coverage tone: all required configured is ok, some is warn, none is error. */
export function coverageTone(covered: number, total: number) {
  if (total === 0 || covered >= total) return "ok" as const;
  return covered === 0 ? ("error" as const) : ("warn" as const);
}
