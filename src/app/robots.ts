import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/application/public/seo";
import { getPublicOrigin } from "@/composition/public";

export default function robots(): MetadataRoute.Robots {
  const origin = getPublicOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/"],
    },
    sitemap: absoluteUrl(origin, "/sitemap.xml"),
    host: origin,
  };
}
