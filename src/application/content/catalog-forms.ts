import type {
  FacilityInput,
  MediaAssignment,
  RoomInput,
} from "@/application/ports/repositories";
import { failure, success, type Result } from "@/application/shared/result";
import { richTextFromEditorText } from "@/domain/shared/rich-text";

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

/** Builds hero + ordered gallery assignments from the media form. */
export function mediaAssignmentsFromForm(
  values: FormValues,
): Result<readonly MediaAssignment[]> {
  const hero = optionalString(values, "heroMediaId");
  const gallery = jsonValue(values, "galleryMediaIds");
  if (
    !Array.isArray(gallery) ||
    gallery.length > MAX_GALLERY ||
    !gallery.every((id) => typeof id === "string" && id.length <= 32)
  ) {
    return failure("VALIDATION", "The gallery selection is invalid.", {
      gallery: [`Choose up to ${MAX_GALLERY} gallery images.`],
    });
  }
  const galleryIds = [...new Set(gallery as string[])];
  if (hero && galleryIds.includes(hero)) {
    return failure("VALIDATION", "The hero image is also in the gallery.", {
      gallery: ["The hero image cannot also be a gallery image."],
    });
  }
  return success([
    ...(hero
      ? [
          {
            mediaId: hero,
            role: "HERO" as const,
            sortOrder: 0,
            altOverride: null,
          },
        ]
      : []),
    ...galleryIds.map((mediaId, index) => ({
      mediaId,
      role: "GALLERY" as const,
      sortOrder: index,
      altOverride: null,
    })),
  ]);
}
