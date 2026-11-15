import { activeFor } from "@calliopelabs/ui";
import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";

import {
  INTERIM_PAGES,
  ROLE_CAPABILITIES,
  ZENTINELLE_NAV,
  interimTabs,
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
    expect(activeFor(nav, "/assistant")).toEqual({
      area: "overview",
      fn: "overview",
    });
    expect(activeFor(nav, "/agents/approvals")?.fn).toBe("approvals");
  });
});

describe("navigation copy", () => {
  const copy = en.shell.nav as Record<string, Record<string, string>>;

  it("names every area, function and interim tab in en as the model does", () => {
    for (const area of ZENTINELLE_NAV) {
      expect(copy.areas[area.key], area.key).toBe(area.label);
      for (const fn of area.groups.flatMap((g) => g.functions)) {
        expect(copy.functions[fn.key], fn.key).toBe(fn.label);
      }
    }
    for (const page of Object.values(INTERIM_PAGES).flat()) {
      expect(copy.tabs[page.key], page.key).toBe(page.label);
    }
  });

  it("localizes the interim tabs", () => {
    const tabs = interimTabs(
      "/policies/simulator",
      ROLE_CAPABILITIES.admin,
      (kind, key) => `${kind}:${key}`,
    );
    expect(tabs.slice(0, 2).map((t) => t.label)).toEqual([
      "function:policies",
      "tab:hierarchy",
    ]);
  });
});

describe("interim tabs", () => {
  const admin = ROLE_CAPABILITIES.admin;

  it("put the function first and mark the page in view", () => {
    const tabs = interimTabs("/policies/simulator", admin);
    expect(tabs[0]).toMatchObject({ key: "policies", href: "/policies" });
    expect(tabs.filter((t) => t.active).map((t) => t.key)).toEqual([
      "simulator",
    ]);
    expect(interimTabs("/policies/p-1", admin).find((t) => t.active)?.key).toBe(
      "policies",
    );
  });

  it("cover pages outside the function's prefix", () => {
    expect(
      interimTabs("/notifications", admin).find((t) => t.active)?.key,
    ).toBe("notifications");
    expect(
      interimTabs("/tools/token-calculator", admin).find((t) => t.active)?.key,
    ).toBe("estimate");
  });

  it("are empty for functions without interim pages, and respect roles", () => {
    expect(interimTabs("/agents", admin)).toEqual([]);
    expect(
      interimTabs("/models", ROLE_CAPABILITIES.viewer).map((t) => t.key),
    ).not.toContain("routes");
  });
});
