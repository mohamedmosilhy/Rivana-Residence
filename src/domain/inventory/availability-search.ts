import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

/** Q-69: the most units one search can ask for, and the disclosure cap. */
export const MAX_UNITS_REQUESTED = 5;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine((value) => {
    try {
      LocalDate.parse(value);
      return true;
    } catch {
      return false;
    }
  }, "Use a real calendar date.");

// Numbers only: HTTP coercion belongs to the contract, and an out of range
// value must reach the use case as a 422, not a 400 (spec 0003).
const searchSchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z
      .number()
      .int("Use a whole number of adults.")
      .min(1, "Choose at least one adult."),
    children: z
      .number()
      .int("Use a whole number of children.")
      .min(0, "Children cannot be negative."),
    unitsRequested: z
      .number()
      .int("Use a whole number of units.")
      .min(1, "Request at least one unit.")
      .max(MAX_UNITS_REQUESTED, `Request at most ${MAX_UNITS_REQUESTED} units.`)
      .optional(),
  })
  .strict();

export type AvailabilitySearch = Readonly<{
  stay: StayRange;
  occupancy: Occupancy;
  unitsRequested: number;
}>;

export type ParsedAvailabilitySearch =
  | Readonly<{ ok: true; value: AvailabilitySearch }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

/** Structural checks only; the public stay policy needs the branch's today. */
export function parseAvailabilitySearch(
  input: unknown,
): ParsedAvailabilitySearch {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: issuesFromZod(parsed.error.issues) };
  }
  const checkIn = LocalDate.parse(parsed.data.checkIn);
  const checkOut = LocalDate.parse(parsed.data.checkOut);
  if (checkOut.compare(checkIn) <= 0) {
    return {
      ok: false,
      issues: [
        { path: "checkOut", message: "Check-out must be after check-in." },
      ],
    };
  }
  return {
    ok: true,
    value: {
      stay: StayRange.create(checkIn, checkOut),
      occupancy: Occupancy.create({
        adults: parsed.data.adults,
        children: parsed.data.children,
      }),
      unitsRequested: parsed.data.unitsRequested ?? 1,
    },
  };
}
