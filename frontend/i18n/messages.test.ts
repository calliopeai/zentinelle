import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { locales, pickerLocales } from "./config";
import { deepMerge } from "./merge";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Catalog = { [key: string]: string | Catalog };

const catalog = (locale: string): Catalog =>
  JSON.parse(
    readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8"),
  );

/** Every leaf key of a catalog, dotted. */
function keys(messages: Catalog, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object"
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const en = catalog("en");
const enKeys = new Set(keys(en));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (["node_modules", ".next", "storybook-static"].includes(name)) return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.(test|stories)\.tsx?$/.test(name)
      ? [full]
      : [];
  });
}

/**
 * The keys the code asks for: each `const t = useTranslations("ns")` (or
 * `getTranslations`) binds `t` to a namespace, and each `t("key")`,
 * `t.rich("key")` or `t.markup("key")` with a literal key names `ns.key`.
 * A template key (`t(\`modes.${mode}\`)`) becomes a pattern that at least
 * one `en` key must match. Keys built any other way are not checked.
 */
function usedKeys(): { file: string; key: string; pattern: RegExp }[] {
  const used: { file: string; key: string; pattern: RegExp }[] = [];
  for (const file of ["app", "components", "ui", "lib", "hooks"].flatMap(
    (dir) => sources(path.join(ROOT, dir)),
  )) {
    const text = readFileSync(file, "utf8");
    const bindings = text.matchAll(
      /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)")?\s*\)/g,
    );
    for (const [, name, namespace] of bindings) {
      const calls = text.matchAll(
        new RegExp(
          `\\b${name}(?:\\.(?:rich|markup|raw))?\\(\\s*(?:"([^"]+)"|\`([^\`]+)\`)`,
          "g",
        ),
      );
      for (const [, literal, template] of calls) {
        const local = literal ?? template;
        const key = namespace ? `${namespace}.${local}` : local;
        const pattern = new RegExp(
          "^" +
            key
              .split(/\$\{[^}]+\}/)
              .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join("[^.]+(?:\\.[^.]+)*") +
            "$",
        );
        used.push({ file: path.relative(ROOT, file), key, pattern });
      }
    }
  }
  return used;
}

describe("message catalogs", () => {
  it("has every key the code uses in en", () => {
    const used = usedKeys();
    // A guard that the scan is real, so the next assertion cannot pass empty.
    expect(used.length).toBeGreaterThan(20);
    const missing = used
      .filter(({ pattern }) => ![...enKeys].some((key) => pattern.test(key)))
      .map(({ file, key }) => `${file}: ${key}`);
    expect(missing, "keys missing from messages/en.json").toEqual([]);
  });

  it.each(locales.filter((l) => l !== "en"))(
    "has no key in %s that en lacks",
    (locale) => {
      const stale = keys(catalog(locale)).filter((key) => !enKeys.has(key));
      expect(stale).toEqual([]);
    },
  );

  it.each([...pickerLocales])("offers %s only with every en key", (locale) => {
    const own = new Set(keys(catalog(locale)));
    expect([...enKeys].filter((key) => !own.has(key))).toEqual([]);
  });

  it("fills a locale's gaps from en", () => {
    const merged = deepMerge(en, { ui: { nav: { label: "Główne" } } });
    expect(keys(merged).sort()).toEqual([...enKeys].sort());
    expect((merged.ui as Catalog).nav).toMatchObject({
      label: "Główne",
      collapse: "Collapse sidebar",
    });
  });
});
