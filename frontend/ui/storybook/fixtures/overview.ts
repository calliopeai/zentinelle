/**
 * The Overview's other two operations: `GetRiskStats` and
 * `ComplianceAlerts` (graphql/risks, graphql/alerts), only the fields each
 * selects. `DashboardStats` is in ./dashboard.
 */
import { GET_COMPLIANCE_ALERTS } from "@/graphql/alerts/queries";
import type {
  ComplianceAlertData,
  ComplianceAlertsData,
} from "@/graphql/alerts/types";
import type { DashboardStatsData } from "@/graphql/dashboard/types";
import { GET_RISK_STATS } from "@/graphql/risks/queries";
import type { RiskStatsData } from "@/graphql/risks/types";
import { DASHBOARD_STATS } from "@/graphql/dashboard/queries";

import { mockError, mockLoading, mockQuery } from "../graphql";
import { dashboardStats, emptyDashboardStats } from "./dashboard";

/** Stories render times against this, so "2 h ago" holds still. */
export const OVERVIEW_NOW = new Date("2026-10-16T15:00:00Z");

export const riskStats: RiskStatsData = {
  riskStats: {
    totalRisks: 19,
    openRisks: 7,
    criticalRisks: 2,
    highRisks: 3,
    risksByLevel: [
      { level: "critical", count: 2 },
      { level: "high", count: 3 },
      { level: "medium", count: 9 },
      { level: "low", count: 5 },
    ],
    risksByCategory: [
      { category: "data_privacy", count: 6 },
      { category: "security", count: 8 },
      { category: "compliance", count: 5 },
    ],
    totalIncidents: 31,
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
    slaMetCount: 27,
    slaBreachedCount: 1,
  },
};

export const quietRiskStats: RiskStatsData = {
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

function alert(
  id: string,
  severity: string,
  title: string,
  endpointName: string,
): ComplianceAlertData {
  return {
    id,
    alertType: "policy_violation",
    severity,
    title,
    description: `${title} on ${endpointName}`,
    userIdentifier: null,
    violationCount: 3,
    firstViolationAt: "2026-10-16T11:10:00Z",
    lastViolationAt: "2026-10-16T13:55:00Z",
    status: "open",
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNotes: null,
    metadata: null,
    createdAt: "2026-10-16T11:10:00Z",
    alertTypeDisplay: "Policy violation",
    severityDisplay: severity.charAt(0).toUpperCase() + severity.slice(1),
    statusDisplay: "Open",
    endpointName,
    acknowledgedByUsername: null,
    resolvedByUsername: null,
  };
}

export const openAlerts: ComplianceAlertsData = {
  complianceAlerts: [
    alert("ca-1", "critical", "Prompt injection blocked", "support-bot"),
    alert("ca-2", "high", "PII in model output", "claims-agent"),
    alert("ca-3", "high", "Budget limit reached", "triage-agent"),
    alert("ca-4", "low", "Unusual token volume", "triage-agent"),
  ],
};

export const noAlerts: ComplianceAlertsData = { complianceAlerts: [] };

/** A busy organization: long names, big numbers, every recent row filled. */
export const longDashboardStats: DashboardStatsData = {
  dashboardStats: {
    ...dashboardStats.dashboardStats!,
    agents: {
      total: 4812,
      active: 4630,
      inactive: 182,
      healthy: 4401,
      unhealthy: 411,
    },
    apiUsage: {
      today: 12345678,
      thisWeek: 71230455,
      thisMonth: 301889120,
      trend: 1240.5,
      last7Days: [1, 2, 3, 4, 5, 6, 7],
    },
    recentActivity: Array.from({ length: 10 }, (_, i) => ({
      id: `long-${i}`,
      type: "update",
      description: `update policy: claims-processing-agent-eu-west-production-canary-${i} output filter for regulated personal health information`,
      timestamp: `2026-10-1${i % 6}T0${i}:00:00Z`,
      actor: "a.very.long.service.account.name@operations.example.com",
    })),
  },
};

export const overviewMocks = {
  full: [
    mockQuery(DASHBOARD_STATS, dashboardStats),
    mockQuery(GET_RISK_STATS, riskStats),
    mockQuery(GET_COMPLIANCE_ALERTS, openAlerts),
  ],
  empty: [
    mockQuery(DASHBOARD_STATS, emptyDashboardStats),
    mockQuery(GET_RISK_STATS, quietRiskStats),
    mockQuery(GET_COMPLIANCE_ALERTS, noAlerts),
  ],
  loading: [
    mockLoading(DASHBOARD_STATS),
    mockLoading(GET_RISK_STATS),
    mockLoading(GET_COMPLIANCE_ALERTS),
  ],
  error: [
    mockError(DASHBOARD_STATS),
    mockQuery(GET_RISK_STATS, riskStats),
    mockQuery(GET_COMPLIANCE_ALERTS, openAlerts),
  ],
  /** The headline loads; the risk register and the alerts do not. */
  partial: [
    mockQuery(DASHBOARD_STATS, dashboardStats),
    mockError(GET_RISK_STATS, "Risk statistics are unavailable."),
    mockError(GET_COMPLIANCE_ALERTS, "Alerts are unavailable."),
  ],
};
