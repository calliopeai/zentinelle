import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { sectionsWithoutPage } from "./routes";

const appDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app/(app)",
);

// Every page under app/(app) as its URL: route groups drop out, and dynamic
// segments stay as [name].
function pageRoutes(dir: string, segments: string[] = []): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      const group = /^\(.+\)$/.test(entry.name);
      return pageRoutes(
        path.join(dir, entry.name),
        group ? segments : [...segments, entry.name],
      );
    }
    return /^page\.[jt]sx?$/.test(entry.name) ? ["/" + segments.join("/")] : [];
  });
}

describe("breadcrumb sections without a page", () => {
  const pages = new Set(pageRoutes(appDir));
  const prefixes = new Set(
    [...pages].flatMap((route) => {
      const parts = route.split("/").filter(Boolean);
      return parts
        .slice(1)
        .map((_, i) => "/" + parts.slice(0, i + 1).join("/"));
    }),
  );
  const withoutPage = [...prefixes].filter((prefix) => !pages.has(prefix));

  it("reads the app's pages", () => {
    // Guards against a walk that silently finds nothing.
    expect(pages.has("/dashboard")).toBe(true);
    expect(pages.size).toBeGreaterThan(50);
  });

  it("are exactly the prefixes that have no page.tsx", () => {
    expect([...sectionsWithoutPage].sort()).toEqual(withoutPage.sort());
  });

  it("are never dynamic, since the breadcrumb matches them literally", () => {
    // /x/[id]/y with no /x/[id] page needs that page, not an entry here.
    expect(withoutPage.filter((prefix) => prefix.includes("["))).toEqual([]);
  });
});
