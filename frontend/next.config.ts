import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output for production container images. The Dockerfile's
  // runner stage copies .next/standalone + .next/static and runs
  // server.js directly.
  output: "standalone",
  // Directives that hold without nonces for Next's inline scripts: the portal
  // cannot be framed, embed plugins, rebase its URLs or post forms elsewhere.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
