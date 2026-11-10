import { z } from "zod";

import {
  DomainValidationError,
  issuesFromZod,
  type DomainIssue,
} from "@/domain/shared/domain-error";
import type { LocalDate } from "@/domain/shared/local-date";
import type { StayRange } from "@/domain/shared/stay-range";

const stayPolicySchema = z
  .object({
    maxStayNights: z.number().int().positive(),
    bookingHorizonDays: z.number().int().nonnegative(),
  })
  .strict();

export type StayPolicy = Readonly<z.infer<typeof stayPolicySchema>>;

/** Q-09, accepted for M6. Composition may supply a different configuration. */
export const DEFAULT_STAY_POLICY: StayPolicy = Object.freeze({
  maxStayNights: 30,
  bookingHorizonDays: 540,
});

/** Caller supplies the branch's today derived from its zone and injected Clock. */
export function validatePublicStay(
  stay: StayRange,
  today: LocalDate,
  policy: StayPolicy = DEFAULT_STAY_POLICY,
): readonly DomainIssue[] {
  const parsed = stayPolicySchema.safeParse(policy);
  if (!parsed.success) {
    throw new DomainValidationError(
      "The stay policy configuration is invalid.",
      issuesFromZod(parsed.error.issues),
    );
  }

  const issues: DomainIssue[] = [];
  const daysAhead = today.daysUntil(stay.checkIn);
  if (daysAhead < 0) {
    issues.push({
      path: "checkIn",
      message: "Choose a check-in date from the branch's today onwards.",
    });
  }
  if (stay.nightCount > parsed.data.maxStayNights) {
    issues.push({
      path: "checkOut",
      message: `Use a stay of at most ${parsed.data.maxStayNights} nights.`,
    });
  }
  if (daysAhead > parsed.data.bookingHorizonDays) {
    issues.push({
      path: "checkIn",
      message: `Choose check-in at most ${parsed.data.bookingHorizonDays} days ahead.`,
    });
  }
  return issues;
}
