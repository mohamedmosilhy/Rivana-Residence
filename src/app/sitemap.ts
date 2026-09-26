import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/application/public/seo";
import { getPublicOrigin, getPublicSitemap } from "@/composition/public";

function latest(values: readonly string[]) {
  if (values.length === 0) return undefined;
  return new Date(
    Math.max(...values.map((value) => new Date(value).getTime())),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getPublicOrigin();
  const { home, about, contact, rooms, facilities } = await getPublicSitemap();
  const entries: MetadataRoute.Sitemap = [];

  if (home) {
    entries.push({
      url: absoluteUrl(origin, "/"),
      lastModified: home.updatedAt,
      changeFrequency: "monthly",
      priority: 1,
    });
  }
  if (about) {
    entries.push({
      url: absoluteUrl(origin, "/about"),
      lastModified: about.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }
  if (rooms.length > 0) {
    entries.push({
      url: absoluteUrl(origin, "/rooms"),
      lastModified: latest(rooms.map((room) => room.updatedAt)),
      changeFrequency: "weekly",
      priority: 0.9,
    });
    entries.push(
      ...rooms.map((room) => ({
        url: absoluteUrl(origin, `/rooms/${room.slug}`),
        lastModified: room.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.8,
        ...(room.hero ? { images: [absoluteUrl(origin, room.hero.src)] } : {}),
      })),
    );
  }
  if (facilities.length > 0) {
    entries.push({
      url: absoluteUrl(origin, "/facilities"),
      lastModified: latest(facilities.map((facility) => facility.updatedAt)),
      changeFrequency: "weekly",
      priority: 0.8,
    });
    entries.push(
      ...facilities.map((facility) => ({
        url: absoluteUrl(origin, `/facilities/${facility.slug}`),
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
      url: absoluteUrl(origin, "/contact"),
      lastModified: contact.updatedAt,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }
  return entries;
}
