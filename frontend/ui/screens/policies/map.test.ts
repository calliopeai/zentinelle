import { describe, expect, it } from "vitest";

import { analyzerData, policyList } from "../../storybook/fixtures/policies";
import {
  analyzePolicies,
  composeGuidedPrompt,
  configFieldsOf,
  fromFieldText,
  hierarchyOf,
  promptVariables,
  toFieldText,
} from "./map";

describe("hierarchyOf", () => {
  const tiers = hierarchyOf(policyList);

  it("orders tiers broadest first", () => {
    expect(tiers.map((t) => t.scope)).toEqual([
      "organization",
      "sub_organization",
      "deployment",
      "endpoint",
    ]);
  });

  it("marks a narrower policy of a type a broader tier sets as an override", () => {
    const deployment = tiers.find((t) => t.scope === "deployment")!;
    expect(deployment.policies[0].policy.id).toBe("pol-budget-support");
    expect(deployment.policies[0].overrides).toBe("organization");
  });

  it("does not mark policies in the same tier as overrides of each other", () => {
    const org = tiers.find((t) => t.scope === "organization")!;
    expect(org.policies.every((p) => p.overrides === null)).toBe(true);
  });

  it("ignores a disabled broader policy", () => {
    const off = policyList.map((p) =>
      p.id === "pol-budget-org" ? { ...p, enabled: false } : p,
    );
    const deployment = hierarchyOf(off).find((t) => t.scope === "deployment")!;
    expect(deployment.policies[0].overrides).toBeNull();
  });
});

describe("analyzePolicies", () => {
  const analysis = analyzePolicies(analyzerData, [
    "budget_limit",
    "rate_limit",
    "data_access",
  ]);

  it("counts live policies by mode and the rest as disabled", () => {
    expect(analysis.total).toBe(policyList.length);
    expect(analysis.enforced + analysis.auditOnly + analysis.disabled).toBe(
      analysis.total,
    );
    expect(analysis.disabled).toBe(1);
  });

  it("finds two live policies of one type, tier and priority", () => {
    expect(analysis.conflicts).toEqual([
      {
        type: "rate_limit",
        scope: "organization",
        priority: 100,
        names: ["Default rate limit", "Legacy rate limit"],
      },
    ]);
  });

  it("lists the types nothing live covers", () => {
    expect(analysis.missingTypes).toEqual(["Data access"]);
  });

  it("flags an empty or turned-off policy", () => {
    expect(analysis.issues.map((i) => i.id)).toEqual(["pol-output-old"]);
  });
});

describe("config fields", () => {
  it("reads the schema's Python type names", () => {
    expect(
      configFieldsOf({
        a: "list",
        b: "bool",
        c: "int",
        d: "float",
        e: "str",
        f: "dict",
      }).map((f) => f.kind),
    ).toEqual(["list", "bool", "int", "float", "str", "str"]);
  });

  it("round-trips a list one item per line", () => {
    expect(toFieldText(["a", "b"], "list")).toBe("a\nb");
    expect(fromFieldText(" a \n\nb\n", "list")).toEqual({ value: ["a", "b"] });
    expect(fromFieldText("", "list")).toEqual({ value: undefined });
  });

  it("refuses a fraction where a whole number goes", () => {
    expect(fromFieldText("12.5", "int").error).toBeDefined();
    expect(fromFieldText("12.5", "float")).toEqual({ value: 12.5 });
    expect(fromFieldText("", "int")).toEqual({});
  });
});

describe("prompts", () => {
  it("finds each variable once, in order", () => {
    expect(
      promptVariables("{{ company }} and {{tone}} and {{company}}"),
    ).toEqual(["company", "tone"]);
  });

  it("composes only the answers given", () => {
    expect(
      composeGuidedPrompt({
        role: "the support assistant.",
        audience: "",
        task: "",
        constraints: "No refunds\n\nBe brief",
        format: "",
      }),
    ).toBe(
      "You are the support assistant.\n\nRules:\n- No refunds\n- Be brief",
    );
  });
});
