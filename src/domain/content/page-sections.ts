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

const linkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  intent: z.enum(["BOOKING", "CONTACT", "ROOMS", "FACILITIES"]),
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

export const pageSectionMetaSchema = z.object({
  heading: z.string().trim().max(160).nullable(),
  eyebrow: z.string().trim().max(80).nullable(),
});

export type PageSectionDraft = Readonly<{
  type: PageSectionType;
  payload: unknown;
  isVisible: boolean;
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
    ABOUT: ["HERO", "CONTACT_CTA"],
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

  if (missing.length > 0) {
    throw new DomainValidationError(
      `${pageKey} is missing required visible sections.`,
      missing.map((type) => ({
        path: "sections",
        message: `A visible ${type} section is required.`,
      })),
    );
  }
}
