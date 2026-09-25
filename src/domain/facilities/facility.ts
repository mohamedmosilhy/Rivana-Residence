import { z } from "zod";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { richTextDocumentSchema } from "@/domain/shared/rich-text";
import type {
  MediaStatus,
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const facilityDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).regex(slugPattern),
  shortDescription: z.string().trim().min(1).max(300),
  description: richTextDocumentSchema,
  openingHoursText: z.string().trim().max(500).nullable(),
});

export type FacilityPublicationCandidate = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: RichTextDocument;
  openingHoursText: string | null;
  status: PublicationStatus;
  media: readonly Readonly<{
    role: "HERO" | "GALLERY";
    status: MediaStatus;
    altText: string;
    altOverride?: string | null;
  }>[];
}>;

export function assertFacilityPublishable(
  facility: FacilityPublicationCandidate,
) {
  const parsed = facilityDraftSchema.safeParse(facility);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

  const readyHeroes = facility.media.filter(
    (media) => media.role === "HERO" && media.status === "READY",
  );
  if (readyHeroes.length !== 1) {
    issues.push({
      path: "media",
      message: "A published facility requires exactly one ready hero image.",
    });
  }

  for (const [index, media] of facility.media.entries()) {
    if (media.status !== "READY") {
      issues.push({
        path: `media.${index}`,
        message: "Published facilities may reference only ready media.",
      });
    }
    if (!(media.altOverride ?? media.altText).trim()) {
      issues.push({
        path: `media.${index}.altText`,
        message: "Meaningful facility media requires alternative text.",
      });
    }
  }

  if (issues.length > 0) {
    throw new DomainValidationError(
      "Facility is not ready to publish.",
      issues,
    );
  }
}

export type FacilityDraft = z.infer<typeof facilityDraftSchema>;
