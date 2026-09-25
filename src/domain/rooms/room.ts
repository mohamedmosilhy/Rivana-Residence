import { z } from "zod";

import { DomainValidationError } from "@/domain/shared/domain-error";
import { richTextDocumentSchema } from "@/domain/shared/rich-text";
import type {
  MediaStatus,
  PublicationStatus,
  RichTextDocument,
} from "@/domain/shared/types";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const roomDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).regex(slugPattern),
  shortDescription: z.string().trim().min(1).max(300),
  description: richTextDocumentSchema,
  sizeSqm: z.number().positive().max(9999).nullable(),
  maxAdults: z.number().int().min(1).max(20),
  maxChildren: z.number().int().min(0).max(20),
  bedSummary: z.string().trim().max(160).nullable(),
  viewSummary: z.string().trim().max(160).nullable(),
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
