/** `DashboardStats` (graphql/dashboard/queries.ts), as the Overview reads it. */
import { DASHBOARD_STATS } from "@/graphql/dashboard/queries";
import type { DashboardStatsData } from "@/graphql/dashboard/types";

import { mockError, mockLoading, mockQuery } from "../graphql";

export const dashboardStats: DashboardStatsData = {
  dashboardStats: {
    agents: { total: 14, active: 11, inactive: 3, healthy: 10, unhealthy: 1 },
    policies: {
      total: 27,
      enabled: 24,
      disabled: 3,
      byType: [
        { type: "budget_limit", count: 6 },
        { type: "rate_limit", count: 5 },
        { type: "output_filter", count: 9 },
        { type: "network_policy", count: 4 },
        { type: "human_oversight", count: 3 },
      ],
    },
    apiUsage: {
      today: 18240,
      thisWeek: 104530,
      thisMonth: 412880,
      trend: 12.4,
      last7Days: [13100, 14820, 15010, 12950, 16230, 14180, 18240],
    },
    recentActivity: [
      {
        id: "act-1",
        type: "policy.updated",
        description: "Budget: support tier raised to $500 a month",
        timestamp: "2026-10-16T14:02:00Z",
        actor: "leo@calliope.ai",
      },
      {
        id: "act-2",
        type: "agent.registered",
        description: "triage-agent registered from astrolift-prod",
        timestamp: "2026-10-16T12:40:00Z",
        actor: "system",
      },
    ],
    alerts: [
      {
        id: "al-1",
        severity: "critical",
        title: "Prompt injection blocked",
        description:
          "support-bot: instruction override in a retrieved document",
        createdAt: "2026-10-16T13:55:00Z",
      },
    ],
    checklist: {
      items: [
        {
          key: "register_agent",
          isComplete: true,
          completedAt: "2026-10-01T09:00:00Z",
        },
        {
          key: "create_policy",
          isComplete: true,
          completedAt: "2026-10-01T09:20:00Z",
        },
        { key: "enable_compliance", isComplete: false, completedAt: null },
      ],
      completedCount: 2,
      totalCount: 3,
      progressPercent: 67,
      isAllComplete: false,
      dismissed: false,
    },
  },
};

export const emptyDashboardStats: DashboardStatsData = {
  dashboardStats: {
    agents: { total: 0, active: 0, inactive: 0, healthy: 0, unhealthy: 0 },
    policies: { total: 0, enabled: 0, disabled: 0, byType: [] },
    apiUsage: { today: 0, thisWeek: 0, thisMonth: 0, trend: 0, last7Days: [] },
    recentActivity: [],
    alerts: [],
    checklist: null,
  },
};

export const dashboardMocks = {
  full: [mockQuery(DASHBOARD_STATS, dashboardStats)],
  empty: [mockQuery(DASHBOARD_STATS, emptyDashboardStats)],
  loading: [mockLoading(DASHBOARD_STATS)],
  error: [mockError(DASHBOARD_STATS)],
};
