// Shared by the client form and its Server Action, so it must not live in a
// "use client" module (server code would receive a client reference).
export const SITE_SETTINGS_FIELDS = [
  "siteName",
  "tagline",
  "phone",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "latitude",
  "longitude",
  "mapEmbedUrl",
  "footerText",
  "defaultSeoTitle",
  "defaultSeoDescription",
] as const;
export type SiteSettingsField = (typeof SITE_SETTINGS_FIELDS)[number];
export type SiteSettingsValues = Readonly<Record<SiteSettingsField, string>>;
