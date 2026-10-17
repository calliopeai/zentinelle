import { describe, expect, it } from "vitest";

import { notificationHref } from "./notification-href";

describe("notificationHref", () => {
  it("prefers an in-app relatedUrl", () => {
    expect(
      notificationHref({ type: "x", metadata: { relatedUrl: "/policies/p1" } }),
    ).toBe("/policies/p1");
  });

  it("ignores an off-site relatedUrl", () => {
    expect(
      notificationHref({
        type: "x",
        metadata: { relatedUrl: "https://evil.example" },
      }),
    ).toBe("/alerts?view=mine");
  });

  it("opens an incident on its own page", () => {
    expect(
      notificationHref({
        type: "incident_opened",
        metadata: { incident_id: "a b" },
      }),
    ).toBe("/incidents/a%20b");
  });

  it("falls back by type onto the new routes", () => {
    expect(notificationHref({ type: "budget_warning", metadata: null })).toBe(
      "/usage/budgets",
    );
  });
});
