import type { NextConfig } from "next";

import { DEFAULT_BRANCH_SLUG } from "./src/domain/branches/default-branch";
import { legacyRedirects } from "./src/infrastructure/http/legacy-redirects";
import { STATIC_SECURITY_HEADERS } from "./src/infrastructure/http/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    // Only library images (served by the /media route) may be optimized,
    // and never with a query string.
    localPatterns: [{ pathname: "/media/**", search: "" }],
  },
  async headers() {
    // The per-request CSP (with its script nonce) is set by src/proxy.ts.
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
  // Old public URLs move permanently to the default branch, in one hop
  // each (spec 0002). That branch cannot be deactivated.
  async redirects() {
    return legacyRedirects(DEFAULT_BRANCH_SLUG);
  },
};

export default nextConfig;
