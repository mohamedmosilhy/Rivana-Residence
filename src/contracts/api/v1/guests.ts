import { z } from "zod";

import { isoDate, Money, Occupancy, Stay } from "./primitives";

// Zod only (D-7). S50 to S53 are staff endpoints; G1, G3 and G4 are guest
// reads with a bearer token. View only in M8: cancellation and change fields
// exist now so M9 fills them in without changing the contract.

const Id = z.string().min(1).max(32);
const Page = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(21_474_836));
const PageSize = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().min(1).max(100));

/** S50. `q` matches the name or the phone. */
export const GuestQuery = z.strictObject({
  q: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), "Use plain text.")
    .optional(),
  blocked: z.enum(["true", "false"]).optional(),
  page: Page.prefault("1"),
  pageSize: PageSize.prefault("25"),
});

const GuestListItem = z.strictObject({
  id: Id,
  phone: z.string(),
  name: z.string(),
  verified: z.boolean(),
  blocked: z.boolean(),
  reservationCount: z
    .number()
    .int()
    .describe("Reservations in the caller's branches only."),
});
export const GuestList = z.strictObject({
  items: z.array(GuestListItem),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

/** S52 and S53. The reason is required for both. */
export const BlockGuestRequest = z.strictObject({
  reason: z.string().min(1).max(500),
});

export const GuestDetail = z.strictObject({
  id: Id,
  phone: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  verified: z.boolean(),
  phoneVerifiedAt: z.iso.datetime().nullable(),
  marketingOptInAt: z.iso.datetime().nullable(),
  marketingOptOutAt: z.iso.datetime().nullable(),
  blocked: z.boolean(),
  blockedAt: z.iso.datetime().nullable(),
  blockedById: Id.nullable(),
  blockReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reservations: z.array(
    z.strictObject({
      id: Id,
      branchId: Id,
      reference: z.string(),
      source: z.enum(["WEBSITE", "STAFF", "EXTERNAL"]),
      status: z.string(),
      stay: Stay,
      totalMinor: z.number().int().nullable(),
    }),
  ),
  blockHistory: z.array(
    z.strictObject({
      id: Id,
      occurredAt: z.iso.datetime(),
      action: z.enum(["guest.blocked", "guest.unblocked"]),
      staffActorId: Id.nullable(),
      reason: z.string().nullable(),
    }),
  ),
});

export const GuestReservationSummary = z.strictObject({
  reference: z.string(),
  status: z.string(),
  branchName: z.string(),
  branchSlug: z.string(),
  stay: Stay,
  units: z.number().int(),
  total: Money.nullable(),
  createdAt: z.iso.datetime(),
});
export const GuestReservationList = z.strictObject({
  items: z.array(GuestReservationSummary),
});

export const GuestReservation = z.strictObject({
  reference: z.string(),
  status: z.string(),
  paymentMethod: z.enum(["PAY_AT_HOTEL", "ONLINE"]),
  paymentStatus: z.string(),
  branch: z.strictObject({
    name: z.string(),
    slug: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
  stay: z.strictObject({ checkIn: isoDate, checkOut: isoDate }),
  units: z.array(
    z.strictObject({
      roomName: z.string().nullable(),
      occupancy: Occupancy,
      subtotal: Money.nullable(),
    }),
  ),
  contact: z
    .strictObject({
      fullName: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      country: z.string().nullable(),
      specialRequests: z.string().nullable(),
    })
    .nullable(),
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
          amountMinor: z.number().int(),
          vehicles: z.number().int().nullable(),
          details: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  cancellationDeadline: z.iso.datetime().nullable(),
  cancellationRequest: z.null(),
  allowedActions: z.array(z.string()),
  createdAt: z.iso.datetime(),
});
