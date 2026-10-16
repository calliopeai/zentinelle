import { describe, expect, it } from "vitest";

import { relatedUrlFor } from "@/components/NotificationBell";

describe("where a notification leads", () => {
  it("opens an incident on the incidents list, which has the only incident view", () => {
    expect(
      relatedUrlFor({
        type: "incident_opened",
        metadata: { incident_id: "3f2a" },
      }),
    ).toBe("/incidents?incident=3f2a");
  });

  it("sends a budget warning to the budget showback page", () => {
    expect(relatedUrlFor({ type: "budget_warning", metadata: {} })).toBe(
      "/budgets/showback",
    );
  });

  it("keeps the policy and risk detail links", () => {
    expect(
      relatedUrlFor({
        type: "policy_violation",
        metadata: { policy_id: "p1" },
      }),
    ).toBe("/policies/p1");
    expect(
      relatedUrlFor({ type: "high_risk", metadata: { risk_id: "r1" } }),
    ).toBe("/risks/r1");
  });
});
