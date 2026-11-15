import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { FORMER_ROUTES } from "./lib/former-routes";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output for production container images. The Dockerfile's
  // runner stage copies .next/standalone + .next/static and runs
  // server.js directly.
  output: "standalone",
  // Pages that moved to their ui-overhaul-ia address; the query string is kept.
  async redirects() {
    return FORMER_ROUTES.map(({ from, to }) => ({
      source: from,
      destination: to,
      permanent: false,
    }));
  },
  // Directives that hold without nonces for Next's inline scripts: the portal
  // cannot be framed, embed plugins, rebase its URLs or post forms elsewhere,
  // and it loads images only from itself (every image it shows is in public/).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; img-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
