import { z } from "zod";

import type { PublicationStatus } from "@/domain/shared/types";

export const promotionDraftSchema = z
  .object({
    internalName: z.string().trim().min(1).max(120),
    headline: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(600),
    code: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
    terms: z.string().trim().max(1200).nullable(),
    startsAt: z.date().nullable(),
    endsAt: z.date().nullable(),
    priority: z.number().int().min(-1000).max(1000),
    showAsPopup: z.boolean(),
  })
  .superRefine((promotion, context) => {
    if (
      promotion.startsAt &&
      promotion.endsAt &&
      promotion.endsAt <= promotion.startsAt
    ) {
      context.addIssue({
        code: "custom",
        message: "Promotion end time must be after its start time.",
        path: ["endsAt"],
      });
    }
  });

export type PromotionCandidate = Readonly<{
  id: string;
  status: PublicationStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  priority: number;
  showAsPopup: boolean;
  publishedAt: Date | null;
}>;

export function isPromotionActive(promotion: PromotionCandidate, now: Date) {
  return (
    promotion.status === "PUBLISHED" &&
    promotion.showAsPopup &&
    (!promotion.startsAt || promotion.startsAt <= now) &&
    (!promotion.endsAt || promotion.endsAt > now)
  );
}

export function selectActivePromotion<T extends PromotionCandidate>(
  promotions: readonly T[],
  now: Date,
) {
  return (
    promotions
      .filter((promotion) => isPromotionActive(promotion, now))
      .sort((left, right) => {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }
        const publicationOrder =
          (right.publishedAt?.getTime() ?? 0) -
          (left.publishedAt?.getTime() ?? 0);
        return publicationOrder || left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

type PublicPromotionContent = Readonly<{
  headline: string;
  body: string;
  code: string;
  terms: string | null;
  showAsPopup: boolean;
}>;

export function nextPromotionVersion(
  currentVersion: number,
  before: PublicPromotionContent,
  after: PublicPromotionContent,
) {
  return JSON.stringify(before) === JSON.stringify(after)
    ? currentVersion
    : currentVersion + 1;
}

export type PromotionDraft = z.infer<typeof promotionDraftSchema>;
