import { describe, expect, it } from "vitest";

import {
  dashboardStats,
  emptyDashboardStats,
} from "../../storybook/fixtures/dashboard";
import {
  openAlerts,
  quietRiskStats,
  riskStats,
} from "../../storybook/fixtures/overview";
import { timeAgo, toOverview } from "./overview-model";

describe("toOverview", () => {
  it("orders what needs attention, most urgent first, and leaves zeros out", () => {
    const { attention } = toOverview({
      stats: dashboardStats.dashboardStats,
      riskStats: riskStats.riskStats,
      openAlerts: openAlerts.complianceAlerts,
      pendingApprovals: 4,
      stagedChanges: 0,
    });
    expect(attention.map((a) => a.kind)).toEqual([
      "alerts",
      "incidents",
      "approvals",
      "agents",
      "risks",
    ]);
    // The low alert is not counted.
    expect(attention[0].count).toBe(3);
    expect(attention[0].description).toBe("1 critical, 2 high");
  });

  it("leaves a REST count out when it is absent", () => {
    const { attention } = toOverview({
      stats: emptyDashboardStats.dashboardStats,
      riskStats: quietRiskStats.riskStats,
      openAlerts: [],
    });
    expect(attention).toEqual([]);
  });

  it("marks incidents unavailable when GetRiskStats failed", () => {
    const { kpis } = toOverview({
      stats: dashboardStats.dashboardStats,
      riskStats: null,
      openAlerts: [],
    });
    expect(kpis.find((k) => k.key === "incidents")?.value).toBeNull();
  });

  it("derives setup steps from the counts when there is no checklist", () => {
    const empty = toOverview({
      stats: emptyDashboardStats.dashboardStats,
      riskStats: null,
      openAlerts: [],
    });
    expect(empty.onboarding?.map((s) => [s.key, s.done])).toEqual([
      ["register_agent", false],
      ["create_policy", false],
    ]);
    const setUp = toOverview({
      stats: { ...dashboardStats.dashboardStats!, checklist: null },
      riskStats: null,
      openAlerts: [],
    });
    expect(setUp.onboarding).toBeNull();
  });

  it("hides a dismissed checklist", () => {
    const stats = dashboardStats.dashboardStats!;
    const { onboarding } = toOverview({
      stats: { ...stats, checklist: { ...stats.checklist!, dismissed: true } },
      riskStats: null,
      openAlerts: [],
    });
    expect(onboarding).toBeNull();
  });

  it("treats a null dashboard (signed out) as empty", () => {
    const overview = toOverview({
      stats: null,
      riskStats: null,
      openAlerts: [],
    });
    expect(overview.kpis[0].value).toBe(0);
    expect(overview.activity).toEqual([]);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  it.each([
    ["2026-10-16T14:59:40Z", "Just now"],
    ["2026-10-16T14:02:00Z", "58 min ago"],
    ["2026-10-16T12:00:00Z", "3 h ago"],
    ["2026-10-14T12:00:00Z", "2 d ago"],
    [null, "Unknown time"],
  ])("%s is %s", (iso, words) => {
    expect(timeAgo(iso, now)).toBe(words);
  });
});
