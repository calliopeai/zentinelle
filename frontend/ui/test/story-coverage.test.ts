import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Storybook first (ui-overhaul-ia §5): every file under ui/ that defines a
 * component has a sibling story, with no allowlist. ui/storybook/ holds the
 * catalog's own helpers (router, mocks, fixtures) and is exempt.
 */
const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

describe("story coverage", () => {
  it("gives every component file under ui/ a sibling story", () => {
    const all = files(UI);
    const componentFiles = all.filter(
      (file) =>
        file.endsWith(".tsx") &&
        !/\.(stories|test)\.tsx$/.test(file) &&
        !file.includes(`${path.sep}storybook${path.sep}`) &&
        /export (default )?function [A-Z]|export const [A-Z]\w* = /.test(
          readFileSync(file, "utf8"),
        ),
    );
    // A guard that the list is real, so the next assertion cannot pass empty.
    expect(componentFiles.length).toBeGreaterThan(3);
    const missing = componentFiles
      .filter((file) => !all.includes(file.replace(/\.tsx$/, ".stories.tsx")))
      .map((file) => path.relative(UI, file))
      .sort();
    expect(
      missing,
      `component files with no story (${missing.length})`,
    ).toEqual([]);
  });
});
