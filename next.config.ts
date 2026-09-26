import type { NextConfig } from "next";

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
  async redirects() {
    return [
      ["/index.html", "/"],
      ["/about.html", "/about"],
      ["/contact.html", "/contact"],
      ["/rooms.html", "/rooms"],
      ["/room-studio-balcony.html", "/rooms/studio-with-balcony"],
      ["/room-deluxe-double.html", "/rooms/deluxe-double"],
      ["/gym.html", "/facilities/fitness-room"],
      ["/swimming-pool.html", "/facilities/swimming-pool"],
    ].map(([source, destination]) => ({
      source: source!,
      destination: destination!,
      permanent: true,
    }));
  },
};

export default nextConfig;
