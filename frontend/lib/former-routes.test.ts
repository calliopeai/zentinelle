import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { INTERIM_PAGES, UNBUILT_ROUTES, ZENTINELLE_NAV } from "@/ui/product";

import { FORMER_ROUTES } from "./former-routes";

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

const pages = new Set(pageRoutes(appDir));

describe("former routes", () => {
  it("reads the app's pages", () => {
    expect(pages.has("/dashboard")).toBe(true);
    expect(pages.size).toBeGreaterThan(50);
  });

  it("redirect to a page, from a path that is no longer one", () => {
    for (const { from, to } of FORMER_ROUTES) {
      expect(pages, `${from} -> ${to}`).toContain(to);
      expect(pages, from).not.toContain(from);
    }
  });

  it("never chain", () => {
    const sources = new Set(FORMER_ROUTES.map((r) => r.from));
    for (const { to } of FORMER_ROUTES) expect(sources).not.toContain(to);
  });
});

describe("console navigation", () => {
  const rows = ZENTINELLE_NAV.flatMap((a) =>
    a.groups.flatMap((g) => g.functions.map((f) => f.href)),
  );

  it("links every shown row to a page", () => {
    for (const href of rows.filter((h) => !UNBUILT_ROUTES.includes(h))) {
      expect(pages, href).toContain(href);
    }
  });

  it("hides only rows that still have no page", () => {
    for (const href of UNBUILT_ROUTES) {
      expect(rows).toContain(href);
      expect(pages, `${href} exists: show it`).not.toContain(href);
    }
  });

  it("links every interim tab to a page", () => {
    for (const page of Object.values(INTERIM_PAGES).flat()) {
      expect(pages, page.href).toContain(page.href);
    }
  });
});
