import type { PageKey } from "@/domain/content/page-sections";

// Tags attached to cached public reads (spec 0002). Every content tag names
// its branch, so one branch's edits never expire another branch's pages.
// Mutations invalidate only the tags whose data they changed; drafts never
// touch public tags.
export const CACHE_TAGS = {
  siteSettings: "site-settings",
  sitemap: "sitemap",
  /** Active branch list, slug lookups, and branch view models. */
  branches: "branches",
  page: (branchSlug: string, key: PageKey) =>
    `branch:${branchSlug}:page:${key.toLowerCase()}`,
  stay: (branchSlug: string) => `branch:${branchSlug}:stay`,
  stayItem: (branchSlug: string, roomSlug: string) =>
    `branch:${branchSlug}:stay:${roomSlug}`,
  facilities: (branchSlug: string) => `branch:${branchSlug}:facilities`,
  facility: (branchSlug: string, facilitySlug: string) =>
    `branch:${branchSlug}:facility:${facilitySlug}`,
} as const;
