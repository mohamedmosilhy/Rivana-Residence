import type { MetadataRoute } from "next";

import { absoluteUrl, pagePath } from "@/application/public/seo";
import { getPublicOrigin, getPublicSitemap } from "@/composition/public";

function latest(values: readonly string[]) {
  if (values.length === 0) return undefined;
  return new Date(
    Math.max(...values.map((value) => new Date(value).getTime())),
  );
}

/**
 * Per active branch: its published pages, listings, and facilities (spec
 * 0002). `/` is listed only while it is the branch chooser; with one branch
 * it redirects, and with none it is a holding page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getPublicOrigin();
  const branches = await getPublicSitemap();
  const entries: MetadataRoute.Sitemap = [];

  if (branches.length >= 2) {
    entries.push({
      url: absoluteUrl(origin, "/"),
      lastModified: latest(branches.map(({ branch }) => branch.updatedAt)),
      changeFrequency: "monthly",
      priority: 1,
    });
  }

  for (const { branch, home, about, contact, rooms, facilities } of branches) {
    const base = `/${branch.slug}`;
    if (home) {
      entries.push({
        url: absoluteUrl(origin, pagePath(branch.slug, "HOME")),
        lastModified: home.updatedAt,
        changeFrequency: "monthly",
        priority: 1,
      });
    }
    if (about) {
      entries.push({
        url: absoluteUrl(origin, pagePath(branch.slug, "ABOUT")),
        lastModified: about.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
    if (rooms.length > 0) {
      entries.push({
        url: absoluteUrl(origin, `${base}/stay`),
        lastModified: latest(rooms.map((room) => room.updatedAt)),
        changeFrequency: "weekly",
        priority: 0.9,
      });
      entries.push(
        ...rooms.map((room) => ({
          url: absoluteUrl(origin, `${base}/stay/${room.slug}`),
          lastModified: room.updatedAt,
          changeFrequency: "monthly" as const,
          priority: 0.8,
          ...(room.hero
            ? { images: [absoluteUrl(origin, room.hero.src)] }
            : {}),
        })),
      );
    }
    if (facilities.length > 0) {
      entries.push({
        url: absoluteUrl(origin, `${base}/facilities`),
        lastModified: latest(facilities.map((facility) => facility.updatedAt)),
        changeFrequency: "weekly",
        priority: 0.8,
      });
      entries.push(
        ...facilities.map((facility) => ({
          url: absoluteUrl(origin, `${base}/facilities/${facility.slug}`),
          lastModified: facility.updatedAt,
          changeFrequency: "monthly" as const,
          priority: 0.7,
          ...(facility.hero
            ? { images: [absoluteUrl(origin, facility.hero.src)] }
            : {}),
        })),
      );
    }
    if (contact) {
      entries.push({
        url: absoluteUrl(origin, pagePath(branch.slug, "CONTACT")),
        lastModified: contact.updatedAt,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }
  return entries;
}
