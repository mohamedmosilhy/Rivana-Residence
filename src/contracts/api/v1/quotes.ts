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
  "PER_VEHICLE",
]);

// SV-5 car count. Checked by hand, not with z.number().int(): Zod 4 treats a
// type or .int() failure as a mismatch of the whole union branch, which would
// report the item ("Invalid input" at services.N) instead of this field. The
// metadata keeps the OpenAPI shape an integer from 1 to 10.
const CarCount = z
  .unknown()
  .superRefine((value, context) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value))
      context.addIssue({
        code: "custom",
        message: "Choose a whole number of cars.",
      });
    else if (value < 1 || value > 10)
      context.addIssue({
        code: "custom",
        message: "Choose from 1 to 10 cars.",
      });
  })
  .meta({
    type: "integer",
    minimum: 1,
    maximum: 10,
    description: "Airport transfer only; cars needed, default 1.",
  });

/** A chosen service: a bare kind, or an object with the transfer's cars. */
export const ServiceInput = z.union([
  ServiceKindValue,
  z
    .object({
      kind: ServiceKindValue,
      vehicles: CarCount.optional(),
      details: z
        .string()
        .trim()
        .max(300)
        .refine(
          (value) => !/[\p{Cc}\p{Cf}]/u.test(value),
          "Use plain text without control characters.",
        )
        .describe("Optional plain text, such as a flight number and time.")
        .optional(),
    })
    .strict(),
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
      .array(ServiceInput)
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
  vehicles: z.number().int().min(1).max(10).nullable(),
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
