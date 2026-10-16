// Every GraphQL operation the portal sends, validated against the backend's
// schema. The schema is the snapshot in schema.graphql, which a backend test
// keeps equal to the live Strawberry schema, so a change on either side that
// breaks a page fails CI here instead of in a customer's browser.
//
// Each module that calls gql`...` is imported for real, so shared field
// strings and fragments interpolate exactly as they do at runtime. gql is
// wrapped to record every document and the file that built it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchema, Kind, validate, type DocumentNode } from "graphql";
import { describe, expect, it, vi } from "vitest";

import knownInvalid from "./known-invalid-operations.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const recorded = vi.hoisted(
  () => [] as { file: string; document: DocumentNode }[],
);

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  const gql = (...args: Parameters<typeof actual.gql>) => {
    const document = actual.gql(...args);
    // The caller is the first stack frame outside this file and node_modules.
    const caller = (new Error().stack ?? "")
      .split("\n")
      .slice(2)
      .map(
        (line) =>
          line.replace("file://", "").match(/(\/\S*?\.tsx?):\d+:\d+/)?.[1],
      )
      .find(
        (file) =>
          file &&
          !file.includes("/node_modules/") &&
          !file.endsWith("operations.test.ts"),
      );
    recorded.push({ file: caller ?? "(unknown)", document });
    return document;
  };
  return { ...actual, gql };
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(full);
  }
  return out;
}

type Operation = { key: string; errors: string[] };

async function collectOperations(): Promise<Operation[]> {
  const files = sourceFiles(root).filter((file) =>
    fs.readFileSync(file, "utf8").includes("gql`"),
  );
  for (const file of files) await import(/* @vite-ignore */ file);

  const schema = buildSchema(
    fs.readFileSync(path.join(root, "graphql/schema.graphql"), "utf8"),
  );
  const operations = new Map<string, Operation>();
  for (const { file, document } of recorded) {
    const fragments = document.definitions.filter(
      (d) => d.kind === Kind.FRAGMENT_DEFINITION,
    );
    for (const definition of document.definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
      const name = definition.name?.value ?? "(anonymous)";
      const key = `${path.relative(root, file)}#${name}`;
      const errors = validate(schema, {
        kind: Kind.DOCUMENT,
        definitions: [definition, ...fragments],
      }).map((e) => e.message);
      operations.set(key, { key, errors });
    }
  }
  return [...operations.values()];
}

describe("portal GraphQL operations vs the backend schema", async () => {
  const operations = await collectOperations();

  it("collects every operation written in the source", () => {
    // Guards against a collector that silently finds nothing.
    const written = sourceFiles(root)
      .map((file) => fs.readFileSync(file, "utf8"))
      .flatMap(
        (text) => text.match(/^\s*(query|mutation|subscription)\s+\w+/gm) ?? [],
      );
    expect(operations.length).toBe(written.length);
    expect(recorded.filter((r) => r.file === "(unknown)")).toEqual([]);
  });

  it("has no invalid operation outside known-invalid-operations.json", () => {
    const unexpected = operations
      .filter((op) => op.errors.length && !(op.key in knownInvalid))
      .map((op) => `${op.key}: ${op.errors.join("; ")}`);
    expect(unexpected).toEqual([]);
  });

  it("lists only operations that still exist and still fail", () => {
    // A fixed or deleted operation must leave the list, so it cannot regress
    // silently later.
    const failing = new Set(
      operations.filter((op) => op.errors.length).map((op) => op.key),
    );
    const stale = Object.keys(knownInvalid).filter((key) => !failing.has(key));
    expect(stale).toEqual([]);
  });
});
