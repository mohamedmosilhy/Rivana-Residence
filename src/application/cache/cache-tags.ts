// Tags attached to cached public reads. Mutations invalidate only the tags
// whose data they changed.
export const CACHE_TAGS = {
  siteSettings: "site-settings",
} as const;
