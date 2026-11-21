import { z } from "zod";

import { isoDate, Money, Occupancy, Stay } from "./primitives";
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

const Id = z
  .string()
  .min(1)
  .max(32)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use a valid identifier.");
const PlainText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use plain text.")
    .trim();
const StaffGuestInput = z.strictObject({
  fullName: PlainText(120).min(1),
  email: z.email().max(320).optional(),
  phone: PlainText(32).min(1),
  country: z.string().length(2).optional(),
  specialRequests: PlainText(1000).optional(),
});
const StaffLine = z.strictObject({ roomTypeId: Id, occupancy: Occupancy });
const Amounts = z.strictObject({
  nights: z
    .array(
      z.strictObject({
        night: isoDate,
        amountMinor: z.number().int().min(0).max(2_147_483_647),
      }),
    )
    .min(1)
    .max(366),
});
const StaffFields = {
  branchId: Id,
  stay: Stay.describe("Branch-local dates with a stay of 1 to 366 nights."),
  guest: StaffGuestInput,
  notes: PlainText(2000).optional(),
};
export const CreateStaffReservationRequest = z.strictObject({
  ...StaffFields,
  lines: z.array(StaffLine).min(1).max(5),
  services: z.array(ServiceInput).optional(),
  couponCode: PlainText(64).min(1).optional(),
  priceOverride: z
    .strictObject({
      lines: z.array(Amounts).min(1).max(5),
      reason: PlainText(500).min(1),
    })
    .optional(),
  sendConfirmation: z.boolean(),
});
export const RecordExternalReservationRequest = z.strictObject({
  ...StaffFields,
  guest: StaffGuestInput.required({ email: true }),
  lines: z
    .array(StaffLine.extend({ amounts: Amounts.optional() }))
    .min(1)
    .max(5),
  externalReference: PlainText(80).min(1),
  channel: PlainText(80).optional(),
});

const ReservationStatus = z.enum([
  "AWAITING_PAYMENT",
  "CONFIRMED",
  "PAYMENT_FAILED",
  "CANCELLED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "NO_SHOW",
]);
const ReservationSource = z.enum(["WEBSITE", "STAFF", "EXTERNAL"]);
const Page = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(21_474_836));
const PageSize = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(100));
export const StaffReservationQuery = z
  .strictObject({
    branchId: Id.optional(),
    status: ReservationStatus.optional(),
    source: ReservationSource.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    q: PlainText(160).min(1).optional(),
    page: Page.prefault("1"),
    pageSize: PageSize.prefault("25"),
    sort: z
      .enum(["checkIn", "-checkIn", "createdAt", "-createdAt"])
      .default("-createdAt"),
  })
  .refine(({ from, to }) => !from || !to || from < to, {
    path: ["to"],
    message: "End must be after start.",
  });

const ListItem = z.strictObject({
  id: Id,
  branchId: Id,
  reference: z.string(),
  status: ReservationStatus,
  source: ReservationSource,
  stay: Stay,
  externalReference: z.string().nullable(),
  guestName: z.string().nullable(),
  totalMinor: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export const StaffReservationList = z.strictObject({
  items: z.array(ListItem),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const StaffReservationDetail = ListItem.omit({
  guestName: true,
  totalMinor: true,
}).extend({
  externalChannel: z.string().nullable(),
  paymentMethod: z.enum(["PAY_AT_HOTEL", "PAYMOB"]),
  paymentStatus: z.enum([
    "NOT_REQUIRED",
    "AWAITING",
    "PAID",
    "REFUND_PENDING",
    "REFUNDED",
  ]),
  guest: z
    .strictObject({
      fullName: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      country: z.string().nullable(),
      specialRequests: z.string().nullable(),
    })
    .nullable(),
  internalNotes: z.string().nullable(),
  couponCode: z.string().nullable(),
  price: z
    .strictObject({
      currency: z.literal("USD"),
      accommodationMinor: z.number().int(),
      servicesMinor: z.number().int(),
      subtotalMinor: z.number().int(),
      discountMinor: z.number().int(),
      taxableMinor: z.number().int(),
      vatRateBasisPoints: z.number().int(),
      vatMinor: z.number().int(),
      totalMinor: z.number().int(),
      services: z.array(
        z.strictObject({
          kind: z.string(),
          unit: z.string(),
          priceMinor: z.number().int(),
          childPriceMinor: z.number().int().nullable(),
          adultQuantity: z.number().int(),
          childQuantity: z.number().int(),
          amountMinor: z.number().int(),
          vehicles: z.number().int().nullable(),
          details: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  lines: z.array(
    z.strictObject({
      id: Id,
      roomTypeId: Id,
      physicalRoomId: Id.nullable(),
      stay: Stay,
      occupancy: Occupancy,
      subtotal: Money.nullable(),
      consumesInventory: z.boolean(),
      nights: z.array(
        z.strictObject({
          night: isoDate,
          amount: Money.nullable(),
          source: z.enum(["BASE", "PERIOD", "MANUAL"]).nullable(),
          periodId: Id.nullable(),
          label: z.string().nullable(),
        }),
      ),
    }),
  ),
  historySummary: z.strictObject({
    createdAt: z.iso.datetime(),
    statusChangedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  }),
  pmsEnteredAt: z.iso.datetime().nullable(),
  pmsEnteredById: Id.nullable(),
  allowedActions: z.array(z.string()),
});

export const StaffReservationHistory = z.strictObject({
  items: z.array(
    z.strictObject({
      id: Id,
      occurredAt: z.iso.datetime(),
      action: z.string(),
      actorType: z.string(),
      staffActorId: Id.nullable(),
      changes: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    }),
  ),
});
