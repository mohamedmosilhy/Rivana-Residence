import { z } from "zod";

// Shared HTTP DTO building blocks (ADR 014, ADR 020). Zod only (D-7), so
// these are safe in client bundles.

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.")
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().startsWith(value),
    "Use a real calendar date.",
  );

/** Money in minor units (cents). One currency, USD (ADR 020). */
export const Money = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("USD"),
  })
  .strict()
  .describe("An amount in minor units (cents).");

/** A stay as branch-local calendar dates; check-out is exclusive. */
export const Stay = z
  .object({ checkIn: isoDate, checkOut: isoDate })
  .strict()
  .refine((stay) => stay.checkOut > stay.checkIn, {
    path: ["checkOut"],
    message: "Check-out must be after check-in.",
  })
  .describe("Branch-local dates (YYYY-MM-DD).");

export const Occupancy = z
  .object({
    adults: z.number().int().min(1),
    children: z.number().int().min(0),
  })
  .strict();

/** RFC 9457 problem body (docs/api/error-model.md). */
export const Problem = z.object({
  type: z.url(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export type MoneyDto = z.infer<typeof Money>;
export type StayDto = z.infer<typeof Stay>;
export type OccupancyDto = z.infer<typeof Occupancy>;
export type ProblemDto = z.infer<typeof Problem>;
