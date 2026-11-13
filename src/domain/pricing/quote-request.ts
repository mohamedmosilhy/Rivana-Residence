import { z } from "zod";

import { issuesFromZod, type DomainIssue } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";

/** Q-69: at most five units in one quote (the P5 cap). */
export const QUOTE_MAX_LINES = 5;

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

// A blank optional text means "not sent", so a form can post its empty field.
const optionalText = (max: number | null) =>
  (max === null ? z.string().trim() : z.string().trim().max(max))
    .optional()
    .transform((value) => (value === "" ? undefined : value));

// Strict on purpose (AC-6): a client can never send a price, discount, tax, or
// total, because any unknown key is refused.
const requestSchema = z
  .object({
    branchSlug: z.string().trim().min(1, "Choose a branch.").max(80),
    stay: z.object({ checkIn: isoDate, checkOut: isoDate }).strict(),
    lines: z
      .array(
        z
          .object({
            roomSlug: z.string().trim().min(1, "Choose a listing.").max(120),
            occupancy: z
              .object({
                adults: z
                  .number()
                  .int("Use a whole number of adults.")
                  .min(1, "Choose at least one adult."),
                children: z
                  .number()
                  .int("Use a whole number of children.")
                  .min(0, "Children cannot be negative."),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1, "Choose at least one unit.")
      .max(QUOTE_MAX_LINES, `Request at most ${QUOTE_MAX_LINES} units.`),
    services: z.array(z.string()).max(10, "Send fewer services."),
    // No length limit here: an over long or odd code is a normal refusal
    // (COUPON_INVALID NOT_FOUND), not a different error shape. The request
    // body size cap already bounds it.
    couponCode: optionalText(null),
    phone: optionalText(32),
  })
  .strict();

export type QuoteRequest = Readonly<{
  branchSlug: string;
  stay: StayRange;
  lines: readonly Readonly<{ roomSlug: string; occupancy: Occupancy }>[];
  /** Raw kinds; `selectRequestedServices` validates them against offerings. */
  services: readonly string[];
  couponCode: string | undefined;
  phone: string | undefined;
}>;

export type ParsedQuoteRequest =
  | Readonly<{ ok: true; value: QuoteRequest }>
  | Readonly<{ ok: false; issues: readonly DomainIssue[] }>;

/** Structural checks only; the public stay policy needs the branch's today. */
export function parseQuoteRequest(input: unknown): ParsedQuoteRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: issuesFromZod(parsed.error.issues).map((issue) =>
        issue.path === "" ? { ...issue, path: "_root" } : issue,
      ),
    };
  }
  const data = parsed.data;
  const checkIn = LocalDate.parse(data.stay.checkIn);
  const checkOut = LocalDate.parse(data.stay.checkOut);
  if (checkOut.compare(checkIn) <= 0) {
    return {
      ok: false,
      issues: [
        {
          path: "stay.checkOut",
          message: "Check-out must be after check-in.",
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      branchSlug: data.branchSlug,
      stay: StayRange.create(checkIn, checkOut),
      lines: data.lines.map((line) => ({
        roomSlug: line.roomSlug,
        occupancy: Occupancy.create(line.occupancy),
      })),
      services: data.services,
      couponCode: data.couponCode,
      phone: data.phone,
    },
  };
}
