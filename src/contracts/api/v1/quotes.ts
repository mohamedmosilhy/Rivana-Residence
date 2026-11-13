import { z } from "zod";

import { isoDate, Money, Occupancy, Stay } from "./primitives";

// Zod only (D-7). The request is strict (AC-6): there is no field for a price,
// discount, tax, or total, so any such key is a 422.
const ServiceKindValue = z.enum(["BREAKFAST", "AIRPORT_TRANSFER"]);
const ServicePriceUnitValue = z.enum([
  "PER_BOOKING",
  "PER_NIGHT",
  "PER_PERSON",
  "PER_PERSON_PER_NIGHT",
]);

export const QuoteRequest = z
  .object({
    branchSlug: z.string().min(1).max(80),
    stay: Stay,
    lines: z
      .array(
        z
          .object({
            roomSlug: z.string().min(1).max(120),
            occupancy: Occupancy,
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .describe("One entry per unit; repeat a listing for several units."),
    services: z
      .array(ServiceKindValue)
      .describe("Only the services the guest chose; each at most once."),
    couponCode: z
      .string()
      .optional()
      .describe(
        "Case insensitive. Requests with a code have a stricter limit.",
      ),
    phone: z
      .string()
      .max(32)
      .optional()
      .describe(
        "A verified phone, only for the per phone coupon limit. Never stored.",
      ),
  })
  .strict();

const QuoteNight = z.object({
  night: isoDate,
  amount: Money,
  label: z.string().nullable(),
});

const QuoteLine = z.object({
  roomSlug: z.string(),
  roomName: z.string(),
  accommodationType: z.enum(["ROOM", "APARTMENT"]),
  occupancy: Occupancy,
  nights: z.array(QuoteNight),
  accommodation: Money,
});

const QuoteServiceLine = z.object({
  kind: ServiceKindValue,
  unit: ServicePriceUnitValue,
  price: Money.describe("The adult (or only) price."),
  childPrice: Money.nullable(),
  adults: z.number().int(),
  children: z.number().int(),
  nights: z.number().int(),
  adultQuantity: z.number().int(),
  childQuantity: z.number().int(),
  amount: Money,
});

export const Quote = z.object({
  stay: Stay,
  lines: z.array(QuoteLine),
  services: z.array(QuoteServiceLine),
  coupon: z
    .object({
      code: z.string(),
      kind: z.enum(["PERCENT", "FIXED"]),
      percentBasisPoints: z.number().int().nullable(),
      amount: Money.nullable(),
    })
    .nullable(),
  accommodation: Money,
  servicesTotal: Money,
  subtotal: Money,
  discount: Money,
  taxable: Money,
  vatRateBasisPoints: z.number().int(),
  vat: Money,
  total: Money,
});

export const QuoteResponse = z.object({
  available: z.boolean(),
  unavailableLines: z
    .array(z.number().int().min(0))
    .describe("Indexes into the request `lines` that cannot be booked."),
  bookable: z
    .boolean()
    .describe("The branch takes online bookings and the quote is available."),
  quote: Quote.nullable().describe("Null only when a line is unavailable."),
});
