import path from "node:path";

import type { StorybookConfig } from "@storybook/react-vite";

/**
 * The Zentinelle AI catalog: the new console UI under ui/, built and
 * reviewed here before any page uses it (ui-overhaul-ia §5, "Storybook
 * first"). Same Storybook major and addons as @calliopelabs/ui.
 */
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../ui/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    const { default: tailwindcss } = await import("@tailwindcss/vite");
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
      resolve: { alias: { "@": path.resolve(import.meta.dirname, "..") } },
      // `staticDirs` copies public/; Vite's own publicDir copy of the same
      // folder races it into storybook-static (EEXIST on CI).
      publicDir: false,
      build: {
        // One client bundle with every story: "use client" means nothing in
        // it, and the chunk-size hint does not apply.
        chunkSizeWarningLimit: 4096,
        rolldownOptions: {
          onLog(
            level: "warn" | "info" | "debug",
            log: { code?: string },
            handler: (level: "warn" | "info" | "debug", log: object) => void,
          ) {
            if (log.code === "MODULE_LEVEL_DIRECTIVE") return;
            handler(level, log);
          },
        },
      },
    });
  },
};

export default config;
