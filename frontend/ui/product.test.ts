import { activeFor } from "@calliopelabs/ui";
import { describe, expect, it } from "vitest";

import {
  ROLE_CAPABILITIES,
  ZENTINELLE_NAV,
  navFor,
  zentinelle,
} from "./product";

const functionsOf = (nav: ReturnType<typeof navFor>) =>
  nav.flatMap((a) => a.groups.flatMap((g) => g.functions.map((f) => f.key)));

describe("Zentinelle navigation (ui-overhaul-ia §4)", () => {
  it("has the seven approved areas, in order", () => {
    expect(ZENTINELLE_NAV.map((a) => a.label)).toEqual([
      "Overview",
      "Agents",
      "Policies",
      "Activity",
      "Risk & compliance",
      "Models & usage",
      "Settings",
    ]);
    expect(zentinelle.name).toBe("Zentinelle AI");
  });

  it("hides admin rows, and the Settings area, from viewers and operators", () => {
    for (const role of ["viewer", "operator"] as const) {
      const nav = navFor(ROLE_CAPABILITIES[role]);
      expect(nav.map((a) => a.key)).not.toContain("settings");
      expect(functionsOf(nav)).not.toContain("evidence");
      expect(functionsOf(nav)).not.toContain("providers");
      expect(functionsOf(nav)).toContain("approvals");
    }
    expect(functionsOf(navFor(ROLE_CAPABILITIES.admin))).toHaveLength(23);
  });

  it("keeps the Astrolift deeplinks inside their areas", () => {
    const nav = navFor(ROLE_CAPABILITIES.viewer);
    expect(activeFor(nav, "/agents/a-7f3c/activity")).toEqual({
      area: "agents",
      fn: "agents",
    });
    expect(activeFor(nav, "/risk")).toEqual({ area: "risk", fn: "risks" });
    expect(activeFor(nav, "/governance")).toEqual({
      area: "overview",
      fn: "overview",
    });
    expect(activeFor(nav, "/agents/approvals")?.fn).toBe("approvals");
  });
});
