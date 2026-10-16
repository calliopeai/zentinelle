import { defineConfig } from "vitest/config";

const resolve = { alias: { "@": import.meta.dirname } };

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          name: "app",
          environment: "node",
          include: ["**/*.test.ts", "**/*.test.tsx"],
          exclude: ["node_modules/**", ".next/**", "ui/**"],
        },
      },
      {
        // The new console UI (ui/): components, stories and their gates, in
        // a browser-like DOM.
        resolve,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["ui/**/*.test.ts", "ui/**/*.test.tsx"],
          setupFiles: ["./ui/test/setup.ts"],
          // The persistent transform cache keeps a module's import.meta.glob
          // expansion from an earlier run, so a new story file would be
          // skipped by the story test without a word.
          fsModuleCache: false,
          // The a11y addon fails a story with violations only in a
          // standalone Vitest run, which it detects through this variable.
          env: { VITEST_STORYBOOK: "false" },
          server: { deps: { inline: ["@storybook/addon-a11y"] } },
        },
      },
    ],
  },
});
