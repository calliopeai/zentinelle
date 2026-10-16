import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { FRAMEWORK_PAGES, frameworkPageHref } from "./compliance-frameworks";

// The framework ids the compliance overview returns are the keys of
// FRAMEWORK_REQUIREMENTS in the backend.
function backendFrameworkIds(): string[] {
  const source = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../backend/zentinelle/models/compliance.py",
    ),
    "utf8",
  );
  const block = source.slice(source.indexOf("FRAMEWORK_REQUIREMENTS = {"));
  return [...block.matchAll(/^ {4}'([A-Za-z0-9_-]+)': \{$/gm)].map((m) => m[1]);
}

describe("compliance framework detail pages", () => {
  it("are found for the backend frameworks the detail page describes", () => {
    expect(frameworkPageHref("HIPAA")).toBe("/compliance/hipaa");
    expect(frameworkPageHref("GDPR")).toBe("/compliance/gdpr");
    expect(frameworkPageHref("SOC2")).toBe("/compliance/soc2");
    expect(frameworkPageHref("EU_AI_ACT")).toBe("/compliance/eu-ai-act");
    expect(frameworkPageHref("NIST_AI_RMF")).toBe("/compliance/nist");
  });

  it("are not invented for a framework the page does not describe", () => {
    expect(frameworkPageHref("CCPA")).toBeNull();
    expect(frameworkPageHref(null)).toBeNull();
    expect(frameworkPageHref("constructor")).toBeNull();
  });

  it("each belong to a framework the backend defines", () => {
    const ids = backendFrameworkIds();
    // Guards against a parse that silently finds nothing.
    expect(ids).toContain("HIPAA");
    for (const { backendId } of Object.values(FRAMEWORK_PAGES)) {
      expect(ids).toContain(backendId);
    }
  });
});
