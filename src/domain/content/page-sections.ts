import { z } from "zod";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { richTextDocumentSchema } from "@/domain/shared/rich-text";

export const PAGE_KEYS = ["HOME", "ABOUT", "CONTACT"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_SECTION_TYPES = [
  "HERO",
  "RICH_TEXT",
  "IMAGE_TEXT_SPLIT",
  "GALLERY",
  "FEATURE_GRID",
  "ROOM_GRID",
  "FACILITY_GRID",
  "CONTACT_CTA",
  "STATS",
] as const;
export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  HOME: "Home",
  ABOUT: "About",
  CONTACT: "Contact",
};

export const PAGE_SECTION_LABELS: Record<PageSectionType, string> = {
  HERO: "Hero",
  RICH_TEXT: "Text",
  IMAGE_TEXT_SPLIT: "Image and text",
  GALLERY: "Gallery",
  FEATURE_GRID: "Feature list",
  ROOM_GRID: "Room grid",
  FACILITY_GRID: "Facility grid",
  CONTACT_CTA: "Contact block",
  STATS: "Facts and figures",
};

export const CTA_INTENTS = [
  "BOOKING",
  "CONTACT",
  "ROOMS",
  "FACILITIES",
] as const;

const linkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  intent: z.enum(CTA_INTENTS),
});

const schemas = {
  HERO: z.object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(400),
    cta: linkSchema.optional(),
  }),
  RICH_TEXT: z.object({
    schemaVersion: z.literal(1),
    document: richTextDocumentSchema,
  }),
  IMAGE_TEXT_SPLIT: z.object({
    schemaVersion: z.literal(1),
    body: richTextDocumentSchema,
    imageSide: z.enum(["LEFT", "RIGHT"]),
    cta: linkSchema.optional(),
  }),
  GALLERY: z.object({
    schemaVersion: z.literal(1),
    layout: z.enum(["EDITORIAL", "GRID"]),
  }),
  FEATURE_GRID: z.object({
    schemaVersion: z.literal(1),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(80),
          body: z.string().trim().min(1).max(240),
          iconKey: z.string().trim().max(60).optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
  ROOM_GRID: z.object({
    schemaVersion: z.literal(1),
    limit: z.number().int().min(1).max(12),
    featuredOnly: z.boolean(),
  }),
  FACILITY_GRID: z.object({
    schemaVersion: z.literal(1),
    limit: z.number().int().min(1).max(12),
    featuredOnly: z.boolean(),
  }),
  CONTACT_CTA: z.object({
    schemaVersion: z.literal(1),
    body: z.string().trim().min(1).max(400),
    formEnabled: z.boolean(),
  }),
  STATS: z.object({
    schemaVersion: z.literal(1),
    items: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(30),
          label: z.string().trim().min(1).max(80),
        }),
      )
      .min(1)
      .max(8),
  }),
} satisfies Record<PageSectionType, z.ZodType>;

const allowedTypes = {
  HOME: new Set<PageSectionType>([
    "HERO",
    "RICH_TEXT",
    "IMAGE_TEXT_SPLIT",
    "GALLERY",
    "FEATURE_GRID",
    "ROOM_GRID",
    "FACILITY_GRID",
    "CONTACT_CTA",
  ]),
  ABOUT: new Set<PageSectionType>([
    "HERO",
    "RICH_TEXT",
    "IMAGE_TEXT_SPLIT",
    "GALLERY",
    "ROOM_GRID",
    "CONTACT_CTA",
    "STATS",
  ]),
  CONTACT: new Set<PageSectionType>(["HERO", "RICH_TEXT", "CONTACT_CTA"]),
} satisfies Record<PageKey, ReadonlySet<PageSectionType>>;

// Sections that make a page work. They can be edited but never hidden, so
// they cannot be removed by accident (sections are never deleted at all).
const LOCKED_VISIBLE: Record<PageKey, ReadonlySet<PageSectionType>> = {
  HOME: new Set(["HERO", "ROOM_GRID", "FACILITY_GRID", "CONTACT_CTA"]),
  ABOUT: new Set(["HERO", "IMAGE_TEXT_SPLIT", "CONTACT_CTA"]),
  CONTACT: new Set(["HERO", "CONTACT_CTA"]),
};

export function isSectionLocked(pageKey: PageKey, type: PageSectionType) {
  return LOCKED_VISIBLE[pageKey].has(type);
}

export function assertSectionVisibilityAllowed(
  pageKey: PageKey,
  type: PageSectionType,
  isVisible: boolean,
) {
  if (!isVisible && isSectionLocked(pageKey, type)) {
    const message = `The ${PAGE_SECTION_LABELS[type]} section is required on the ${PAGE_LABELS[pageKey]} page and cannot be hidden.`;
    throw new DomainValidationError(message, [{ path: "isVisible", message }]);
  }
}

// Page policy for ordering: the hero always opens the page and the contact
// block always closes it. Everything between may move.
export function isSectionPinned(type: PageSectionType) {
  return type === "HERO" || type === "CONTACT_CTA";
}

export function assertSectionOrder(
  pageKey: PageKey,
  types: readonly PageSectionType[],
) {
  const issues = [];
  if (types.includes("HERO") && types[0] !== "HERO") {
    issues.push({
      path: "sections",
      message: "The Hero section must stay first.",
    });
  }
  if (types.includes("CONTACT_CTA") && types.at(-1) !== "CONTACT_CTA") {
    issues.push({
      path: "sections",
      message: "The Contact block must stay last.",
    });
  }
  if (issues.length > 0) {
    throw new DomainValidationError(
      `This order is not allowed on the ${PAGE_LABELS[pageKey]} page.`,
      issues,
    );
  }
}

export const pageSectionMetaSchema = z.object({
  heading: z.string().trim().max(160).nullable(),
  eyebrow: z.string().trim().max(80).nullable(),
});

export type SectionMediaCandidate = Readonly<{
  role: string;
  status: string;
  altText: string;
  altOverride?: string | null;
  rightsConfirmed?: boolean;
}>;

export type PageSectionDraft = Readonly<{
  type: PageSectionType;
  payload: unknown;
  isVisible: boolean;
  media?: readonly SectionMediaCandidate[];
}>;

export function parsePageSectionPayload(
  pageKey: PageKey,
  type: PageSectionType,
  payload: unknown,
) {
  if (!allowedTypes[pageKey].has(type)) {
    throw new DomainValidationError(`${type} is not allowed on ${pageKey}.`, [
      { path: "type", message: `${type} is not allowed on ${pageKey}.` },
    ]);
  }

  const result = schemas[type].safeParse(payload);
  if (!result.success) {
    throw new DomainValidationError(
      `Invalid ${type} section payload.`,
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}

export function assertPagePublishable(
  pageKey: PageKey,
  sections: readonly PageSectionDraft[],
) {
  const visible = sections.filter((section) => section.isVisible);
  for (const section of visible) {
    parsePageSectionPayload(pageKey, section.type, section.payload);
  }

  const types = new Set(visible.map((section) => section.type));
  const required: Record<PageKey, readonly PageSectionType[]> = {
    HOME: ["HERO", "ROOM_GRID", "FACILITY_GRID", "CONTACT_CTA"],
    ABOUT: ["HERO", "IMAGE_TEXT_SPLIT", "CONTACT_CTA"],
    CONTACT: ["HERO", "CONTACT_CTA"],
  };
  const missing = required[pageKey].filter((type) => !types.has(type));

  if (
    pageKey === "HOME" &&
    !types.has("RICH_TEXT") &&
    !types.has("IMAGE_TEXT_SPLIT")
  ) {
    missing.push("RICH_TEXT");
  }

  const issues = missing.map((type) => ({
    path: "sections",
    message: `A visible ${PAGE_SECTION_LABELS[type]} section is required.`,
  }));

  // Images in visible sections follow the same rules as room images;
  // decorative images need no alternative text.
  for (const section of visible) {
    const label = PAGE_SECTION_LABELS[section.type];
    for (const media of section.media ?? []) {
      if (media.status !== "READY") {
        issues.push({
          path: "sections",
          message: `The ${label} section uses an image that is not ready.`,
        });
      } else if (media.rightsConfirmed === false) {
        issues.push({
          path: "sections",
          message: `The ${label} section uses an image whose usage rights are not confirmed.`,
        });
      }
      if (
        media.role !== "DECORATIVE" &&
        !(media.altOverride ?? media.altText).trim()
      ) {
        issues.push({
          path: "sections",
          message: `An image in the ${label} section needs alternative text.`,
        });
      }
    }
  }

  // The contact page exists to take enquiries.
  if (
    pageKey === "CONTACT" &&
    visible.some(
      (section) =>
        section.type === "CONTACT_CTA" &&
        (section.payload as { formEnabled?: unknown } | null)?.formEnabled !==
          true,
    )
  ) {
    issues.push({
      path: "sections",
      message: "The Contact page's contact block must show the enquiry form.",
    });
  }

  if (issues.length > 0) {
    throw new DomainValidationError(
      `${pageKey} is missing required visible sections.`,
      issues,
    );
  }
}
