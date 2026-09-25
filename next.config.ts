import type { NextConfig } from "next";

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
};

export default nextConfig;
