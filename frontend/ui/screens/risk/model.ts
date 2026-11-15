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

import { useTranslations } from "next-intl";

import { navFor } from "../../product";

/** The Fibonacci scales of the FMEA assessment, highest first. */
export const LIKELIHOOD_VALUES = [8, 5, 3, 2, 1] as const;

export const IMPACT_VALUES = [1, 2, 3, 5, 8] as const;

export const RISK_CATEGORIES_VALUES = [
  "security",
  "privacy",
  "compliance",
  "operational",
  "reputational",
  "financial",
  "ethical",
] as const;

export const RISK_STATUSES_VALUES = [
  "identified",
  "assessed",
  "mitigating",
  "accepted",
  "transferred",
  "closed",
] as const;

export const RISK_LEVELS_VALUES = [
  "critical",
  "high",
  "medium",
  "low",
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

export const RISKS_TABS_ROUTES = [
  { key: "register", href: "/risks" },
  { key: "overview", href: "/risks/overview" },
] as const;

export const COMPLIANCE_TABS_ROUTES = [
  { key: "frameworks", href: "/compliance" },
  { key: "gaps", href: "/compliance/gaps" },
] as const;

export const EVIDENCE_TABS_ROUTES = [
  { key: "coverage", href: "/evidence" },
  { key: "atlas", href: "/evidence/atlas" },
  { key: "brocs", href: "/evidence/brocs" },
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

/**
 * The area's scales, value names and tab rows in the reader's language, from
 * `risk.labels`. The scales keep their order and values; only labels change.
 */
export function useRiskLabels() {
  const t = useTranslations("risk.labels") as unknown as (
    key: string,
  ) => string;
  const scale = <V extends string | number>(
    group: string,
    values: readonly V[],
  ) => values.map((value) => ({ value, label: t(`${group}.${value}`) }));
  const tabs = (
    group: string,
    routes: readonly { key: string; href: string }[],
  ) => routes.map((r) => ({ ...r, label: t(`tabs.${group}.${r.key}`) }));
  return {
    LIKELIHOOD: scale("likelihood", LIKELIHOOD_VALUES),
    IMPACT: scale("impact", IMPACT_VALUES),
    RISK_CATEGORIES: scale("categories", RISK_CATEGORIES_VALUES),
    RISK_STATUSES: scale("statuses", RISK_STATUSES_VALUES),
    RISK_LEVELS: scale("levels", RISK_LEVELS_VALUES),
    EVIDENCE_LABEL: Object.fromEntries(
      Object.keys(EVIDENCE_TONE).map((k) => [k, t(`evidence.${k}`)]),
    ) as Record<string, string>,
    RISKS_TABS: tabs("risks", RISKS_TABS_ROUTES),
    COMPLIANCE_TABS: tabs("compliance", COMPLIANCE_TABS_ROUTES),
    EVIDENCE_TABS: tabs("evidence", EVIDENCE_TABS_ROUTES),
  };
}
