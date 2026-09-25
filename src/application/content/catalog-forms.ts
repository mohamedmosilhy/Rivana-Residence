import type {
  FacilityInput,
  MediaAssignment,
  RoomInput,
  SectionMediaAssignment,
} from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import { richTextFromEditorText } from "@/domain/shared/rich-text";

const PAGE_SECTION_MEDIA_ROLES = [
  "BACKGROUND",
  "PRIMARY",
  "GALLERY",
  "DECORATIVE",
] as const;

import {
  checkbox,
  jsonValue,
  optionalNumber,
  optionalString,
  requiredNumber,
  stringValue,
  type FormValues,
} from "./form-values";

function features(values: FormValues) {
  const raw = jsonValue(values, "features");
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "object" && item !== null && "label" in item
      ? { label: String((item as { label: unknown }).label ?? "") }
      : { label: "" },
  );
}

const common = (values: FormValues) => ({
  name: stringValue(values, "name"),
  slug: stringValue(values, "slug"),
  shortDescription: stringValue(values, "shortDescription"),
  description: richTextFromEditorText(stringValue(values, "description")),
  seoTitle: optionalString(values, "seoTitle"),
  seoDescription: optionalString(values, "seoDescription"),
  featured: checkbox(values, "featured"),
});

/** Shapes room form values; the domain schema validates them. */
export function roomInputFromForm(values: FormValues): RoomInput {
  return {
    ...common(values),
    sizeSqm: optionalNumber(values, "sizeSqm"),
    maxAdults: requiredNumber(values, "maxAdults") as number,
    maxChildren: (requiredNumber(values, "maxChildren") ?? 0) as number,
    bedSummary: optionalString(values, "bedSummary"),
    viewSummary: optionalString(values, "viewSummary"),
    features: features(values),
  };
}

export function facilityInputFromForm(values: FormValues): FacilityInput {
  return {
    ...common(values),
    openingHoursText: optionalString(values, "openingHoursText"),
  };
}

const MAX_GALLERY = 24;

type ChosenImage = Readonly<{ mediaId: string; altOverride: string | null }>;

function chosenImage(value: unknown): ChosenImage | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const { mediaId, altOverride } = value as Record<string, unknown>;
  if (typeof mediaId !== "string" || !/^[a-z0-9]{1,32}$/.test(mediaId)) {
    return undefined;
  }
  if (
    altOverride !== null &&
    altOverride !== undefined &&
    typeof altOverride !== "string"
  ) {
    return undefined;
  }
  const override = typeof altOverride === "string" ? altOverride.trim() : "";
  if (override.length > 300) return undefined;
  return { mediaId, altOverride: override || null };
}

function chosenList(value: unknown, max: number): ChosenImage[] | undefined {
  if (!Array.isArray(value) || value.length > max) return undefined;
  const list = value.map(chosenImage);
  if (list.some((item) => !item)) return undefined;
  const unique = new Map(
    (list as ChosenImage[]).map((item) => [item.mediaId, item]),
  );
  return [...unique.values()];
}

const INVALID_SELECTION = failure(
  "VALIDATION",
  "The image selection is invalid.",
  {
    media: ["The image selection is invalid. Reload the page and try again."],
  },
);

export type EntityMediaSelection = Readonly<{
  assignments: readonly MediaAssignment[];
  socialImageId: string | null;
}>;

/**
 * Reads the room/facility image editor: a hero, an ordered gallery (each
 * with an optional contextual alt text), and an optional sharing image.
 */
export function entityMediaFromForm(
  values: FormValues,
): Result<EntityMediaSelection> {
  const raw = jsonValue(values, "media");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return INVALID_SELECTION;
  }
  const { hero, gallery, social } = raw as Record<string, unknown>;
  const heroImage = chosenImage(hero ?? null);
  const galleryImages = chosenList(gallery ?? [], MAX_GALLERY);
  const socialImage = chosenImage(social ?? null);
  if (heroImage === undefined || !galleryImages || socialImage === undefined) {
    return INVALID_SELECTION;
  }
  if (
    heroImage &&
    galleryImages.some((item) => item.mediaId === heroImage.mediaId)
  ) {
    return failure("VALIDATION", "The hero image is also in the gallery.", {
      media: ["The hero image cannot also be a gallery image."],
    });
  }
  return success({
    assignments: [
      ...(heroImage
        ? [{ ...heroImage, role: "HERO" as const, sortOrder: 0 }]
        : []),
      ...galleryImages.map((item, index) => ({
        ...item,
        role: "GALLERY" as const,
        sortOrder: index,
      })),
    ],
    socialImageId: socialImage?.mediaId ?? null,
  });
}

/** Reads a page section's images: `{ [role]: ChosenImage[] }`. */
export function sectionMediaFromForm(
  values: FormValues,
): Result<readonly SectionMediaAssignment[]> {
  const raw = jsonValue(values, "media");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return INVALID_SELECTION;
  }
  const assignments: SectionMediaAssignment[] = [];
  for (const [role, list] of Object.entries(raw)) {
    if (!(PAGE_SECTION_MEDIA_ROLES as readonly string[]).includes(role)) {
      return INVALID_SELECTION;
    }
    const images = chosenList(list, MAX_GALLERY);
    if (!images) return INVALID_SELECTION;
    images.forEach((image, index) =>
      assignments.push({
        ...image,
        role: role as SectionMediaAssignment["role"],
        sortOrder: index,
      }),
    );
  }
  return success(assignments);
}

/** Reads a single optional image id field. */
export function optionalMediaId(values: FormValues, name: string) {
  const value = optionalString(values, name);
  return value && /^[a-z0-9]{1,32}$/.test(value) ? value : null;
}
