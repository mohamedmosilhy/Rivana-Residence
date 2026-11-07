// Shared by the client form and its Server Action, so it must not live in a
// "use client" module (server code would receive a client reference).
// Brand-wide fields only; contact and map are set per branch (spec 0002).
export const SITE_SETTINGS_FIELDS = [
  "siteName",
  "tagline",
  "footerText",
  "defaultSeoTitle",
  "defaultSeoDescription",
] as const;
export type SiteSettingsField = (typeof SITE_SETTINGS_FIELDS)[number];
export type SiteSettingsValues = Readonly<Record<SiteSettingsField, string>>;
