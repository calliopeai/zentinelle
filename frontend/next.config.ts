import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output for production container images. The Dockerfile's
  // runner stage copies .next/standalone + .next/static and runs
  // server.js directly.
  output: "standalone",
};

export default withNextIntl(nextConfig);
