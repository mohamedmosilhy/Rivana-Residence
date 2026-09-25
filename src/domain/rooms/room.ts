import { z } from "zod";

import {
  optionalText,
  requiredText,
  seoFields,
} from "@/domain/shared/content-fields";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { richTextDocumentSchema } from "@/domain/shared/rich-text";
import { slugSchema } from "@/domain/shared/slug";
import type {
  MediaStatus,
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";

export const MAX_ROOM_FEATURES = 20;

export const roomFeatureSchema = z
  .object({ label: requiredText("a feature", 120) })
  .strict();

// Marketing facts only. There are deliberately no price, rate, or
// availability fields; those belong to the external reservation system.
export const roomDraftSchema = z.object({
  name: requiredText("the room name", 120),
  slug: slugSchema,
  shortDescription: requiredText("a short description", 300),
  description: richTextDocumentSchema,
  sizeSqm: z
    .number({ error: "Enter the size as a number." })
    .positive("Size must be greater than 0.")
    .max(9999, "Size must be 9999 m² or less.")
    .nullable(),
  maxAdults: z
    .number({ error: "Enter the number of adults." })
    .int("Use a whole number.")
    .min(1, "At least 1 adult.")
    .max(20, "20 adults at most."),
  maxChildren: z
    .number({ error: "Enter the number of children." })
    .int("Use a whole number.")
    .min(0, "Children cannot be negative.")
    .max(20, "20 children at most."),
  bedSummary: optionalText(160),
  viewSummary: optionalText(160),
  features: z
    .array(roomFeatureSchema)
    .max(MAX_ROOM_FEATURES, `Add at most ${MAX_ROOM_FEATURES} features.`)
    .default([]),
  ...seoFields,
});

export type RoomMediaCandidate = Readonly<{
  role: "HERO" | "GALLERY";
  status: MediaStatus;
  altText: string;
  altOverride?: string | null;
}>;

export type RoomPublicationCandidate = Readonly<{
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: RichTextDocument;
  sizeSqm: number | null;
  maxAdults: number;
  maxChildren: number;
  bedSummary: string | null;
  viewSummary: string | null;
  status: PublicationStatus;
  media: readonly RoomMediaCandidate[];
}>;

export function assertRoomPublishable(room: RoomPublicationCandidate) {
  const parsed = roomDraftSchema.safeParse(room);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

  const readyHeroes = room.media.filter(
    (media) => media.role === "HERO" && media.status === "READY",
  );
  if (readyHeroes.length !== 1) {
    issues.push({
      path: "media",
      message: "A published room requires exactly one ready hero image.",
    });
  }

  for (const [index, media] of room.media.entries()) {
    if (media.status !== "READY") {
      issues.push({
        path: `media.${index}`,
        message: "Published rooms may reference only ready media.",
      });
    }
    if (!(media.altOverride ?? media.altText).trim()) {
      issues.push({
        path: `media.${index}.altText`,
        message: "Meaningful room media requires alternative text.",
      });
    }
  }

  if (issues.length > 0) {
    throw new DomainValidationError("Room is not ready to publish.", issues);
  }
}

export type RoomDraft = z.infer<typeof roomDraftSchema>;
