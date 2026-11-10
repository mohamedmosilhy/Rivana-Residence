import { z } from "zod";

import { RoomTypeSummary } from "./branches";
import { Money, Occupancy, Stay } from "./primitives";

// Structure only. Date, number, stay and occupancy semantics produce 422 in
// SearchAvailability; query structure errors are 400 in the HTTP wrapper.
export const AvailabilityQuery = z
  .object({
    checkIn: z.string().describe("Check-in in YYYY-MM-DD, branch local date."),
    checkOut: z.string().describe("Exclusive check-out in YYYY-MM-DD."),
    adults: z.string().describe("Whole number, at least 1, per unit."),
    children: z.string().describe("Whole number, at least 0, per unit."),
    unitsRequested: z
      .string()
      .optional()
      .describe("Whole number 1–5; defaults to 1."),
  })
  .strict();

export const AvailabilityResult = z
  .object({
    roomType: RoomTypeSummary,
    available: z.boolean(),
    unitsAvailable: z.number().int().min(0).max(5),
    pricePerNight: z
      .array(Money)
      .describe("Ordered per-unit nightly prices; empty when unpriced."),
    accommodationTotal: Money.nullable().describe(
      "Requested quantity, before VAT; null when unpriced.",
    ),
    reason: z.enum(["SOLD_OUT", "OCCUPANCY", "UNPRICED"]).optional(),
  })
  .strict();

export const AvailabilityResponse = z
  .object({
    stay: Stay,
    occupancy: Occupancy,
    results: z.array(AvailabilityResult),
  })
  .strict();

export type AvailabilityQueryDto = z.infer<typeof AvailabilityQuery>;
export type AvailabilityResponseDto = z.infer<typeof AvailabilityResponse>;
