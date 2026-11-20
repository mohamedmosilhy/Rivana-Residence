import { z } from "zod";

import { Money, Occupancy, Stay } from "./primitives";
import { ServiceInput } from "./quotes";

// Zod only (D-7). API-P7 is strict (AC-1, T-VAL): there is no field for a
// price, discount, tax, status or branch id, so any such key is a 422. The
// guest phone must equal the verified phone; the use case enforces that.

/** The `Idempotency-Key` header (spec 0005 Decision 1b). */
export const IdempotencyKey = z
  .string()
  .regex(/^[\x21-\x7E]{8,128}$/)
  .describe("8 to 128 printable ASCII characters, no spaces.");

const GuestInput = z
  .object({
    fullName: z.string().min(1).max(120),
    email: z.string().min(3).max(254),
    phone: z
      .string()
      .max(32)
      .describe("Must equal the phone the token was issued for."),
    country: z.string().length(2).optional(),
    specialRequests: z.string().max(1000).optional(),
  })
  .strict();

export const WebsiteReservationRequest = z
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
      .max(5),
    services: z.array(ServiceInput),
    couponCode: z.string().max(64).optional(),
    guest: GuestInput,
    phoneVerificationToken: z
      .string()
      .min(16)
      .max(128)
      .describe("From API-P10 (purpose BOOKING). Single use."),
    paymentMethod: z
      .enum(["PAY_AT_HOTEL", "PAYMOB"])
      .describe("PAYMOB returns 409 PAYMENT_METHOD_UNAVAILABLE in M8."),
    expectedTotal: Money.describe("The total from the last quote."),
    consent: z.object({ privacyNoticeVersion: z.string().max(40) }).strict(),
    marketingOptIn: z
      .object({ consentVersion: z.string().max(40) })
      .strict()
      .optional(),
    website: z
      .string()
      .max(32_768)
      .optional()
      .describe("Honeypot. Leave empty."),
  })
  .strict();

export const WebsiteReservationCreated = z.object({
  reference: z.string(),
  status: z.enum(["CONFIRMED"]),
  total: Money,
  manageUrl: z
    .string()
    .describe("Shown once. Contains the manage token in the fragment."),
});

export const WebsiteReservationReplayed = z.object({
  reference: z.string(),
  status: z
    .enum([
      "AWAITING_PAYMENT",
      "CONFIRMED",
      "PAYMENT_FAILED",
      "CANCELLED",
      "CHECKED_IN",
      "CHECKED_OUT",
      "NO_SHOW",
    ])
    .describe("The booking's current status, which may have moved on."),
  manageUrl: z.null(),
});
