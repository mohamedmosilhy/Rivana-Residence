import type { PageKey } from "@/domain/content/page-sections";

// Tags attached to cached public reads. Mutations invalidate only the tags
// whose data they changed; drafts never touch public tags.
export const CACHE_TAGS = {
  siteSettings: "site-settings",
  sitemap: "sitemap",
  rooms: "rooms",
  room: (slug: string) => `room:${slug}`,
  facilities: "facilities",
  facility: (slug: string) => `facility:${slug}`,
  page: (key: PageKey) => `page:${key.toLowerCase()}`,
  activePromotion: "promotion:active",
} as const;
