import { z } from "zod";

// Form fields arrive as strings. An empty or whitespace-only value means
// "not set", so every optional field normalizes it to null before validation.
function blankToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

function optionalText(max: number) {
  return z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .max(max, `Use ${max} characters or fewer.`)
      .nullable()
      .default(null),
  );
}

// Only Google Maps embed URLs are accepted. The value becomes an iframe
// source on the public contact page, so arbitrary origins are refused.
const MAP_EMBED_PREFIX = "https://www.google.com/maps/embed";

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** True for an HTTPS Google Maps embed URL (shared with branch locations). */
export function isMapEmbedUrl(value: string) {
  return value.startsWith(MAP_EMBED_PREFIX) && isHttpsUrl(value);
}

export const MAP_EMBED_MESSAGE = `Paste a Google Maps embed link starting with ${MAP_EMBED_PREFIX}.`;

/** Phone numbers as staff type them (shared with branch contact details). */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,38}$/;
export const PHONE_MESSAGE =
  "Enter a phone number using digits, spaces, brackets, or dashes.";

// Brand-wide identity only. Contact details, address, coordinates, and the
// map belong to each branch since M5 (owner decision, spec 0002); their
// columns stay until a later contract migration and are no longer written.
export const siteSettingsSchema = z.object({
  siteName: z
    .string({ error: "Enter the residence name." })
    .trim()
    .min(1, "Enter the residence name.")
    .max(120, "Use 120 characters or fewer."),
  tagline: optionalText(240),
  footerText: optionalText(500),
  defaultSeoTitle: optionalText(70),
  defaultSeoDescription: optionalText(170),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "linkedin",
  "tripadvisor",
  "whatsapp",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tripadvisor: "Tripadvisor",
  whatsapp: "WhatsApp",
};

export const MAX_SOCIAL_LINKS = SOCIAL_PLATFORMS.length;

export const socialLinkSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS, { error: "Choose a platform." }),
  label: z
    .string()
    .trim()
    .min(1, "Enter a label.")
    .max(80, "Use 80 characters or fewer."),
  url: z
    .string()
    .trim()
    .max(2048, "Use 2048 characters or fewer.")
    .refine(isHttpsUrl, "Enter a full link starting with https://."),
  isVisible: z.boolean(),
});

// Array position is the display order.
export const socialLinksSchema = z
  .array(socialLinkSchema)
  .max(MAX_SOCIAL_LINKS, `Add at most ${MAX_SOCIAL_LINKS} links.`)
  .superRefine((links, context) => {
    const seen = new Set<string>();
    links.forEach((link, index) => {
      if (seen.has(link.platform)) {
        context.addIssue({
          code: "custom",
          path: [index, "platform"],
          message: "Each platform can be listed once.",
        });
      }
      seen.add(link.platform);
    });
  });

export type SocialLinkInput = z.infer<typeof socialLinkSchema>;
