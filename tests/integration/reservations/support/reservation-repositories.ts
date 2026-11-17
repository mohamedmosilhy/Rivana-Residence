import type { ReservationInsert } from "@/application/reservations";
import { parseGuestContact } from "@/domain/guests";
import { ReservationReference } from "@/domain/reservations";
import { LocalDate } from "@/domain/shared/local-date";
import { Money } from "@/domain/shared/money";
import { Occupancy } from "@/domain/shared/occupancy";
import { StayRange } from "@/domain/shared/stay-range";
import { TEST_BRANCH_ID } from "../../support/database";

let sequence = 0;
export const at = new Date("2031-01-01T10:00:00.000Z");
export const local = (value: string) => LocalDate.parse(value);
export const range = (start = "2031-07-04", end = "2031-07-06") =>
  StayRange.create(local(start), local(end));
export function reservationInput(
  roomTypeId: string,
  overrides: Partial<ReservationInsert> = {},
): ReservationInsert {
  const id = ++sequence;
  const stay = overrides.stay ?? range();
  const accommodationMinor = stay.nightCount * 100;
  const vatMinor = (accommodationMinor * 15) / 100;
  return {
    id: `repo-booking-${id}`,
    reference: ReservationReference.parse(
      `RR-${id.toString().padStart(8, "0")}`,
    ),
    branchId: TEST_BRANCH_ID,
    source: "STAFF",
    status: "CONFIRMED",
    stay,
    guestId: null,
    contact: parseGuestContact({
      fullName: "Fictional Guest",
      email: "fiction@example.test",
      phone: "+201001234567",
      country: "EG",
      specialRequests: "Quiet room",
    }),
    internalNotes: "Staff note",
    externalReference: null,
    snapshot: {
      accommodationMinor,
      servicesMinor: 0,
      subtotalMinor: accommodationMinor,
      discountMinor: 0,
      taxableMinor: accommodationMinor,
      vatRateBasisPoints: 1500,
      vatMinor,
      totalMinor: accommodationMinor + vatMinor,
      serviceLines: [],
      couponValue: null,
    },
    couponId: null,
    couponCode: null,
    paymentMethod: "PAY_AT_HOTEL",
    paymentStatus: "NOT_REQUIRED",
    privacyNoticeVersion: null,
    manageTokenHash: null,
    manageTokenExpiresAt: null,
    idempotencyKeyHash: null,
    requestFingerprint: null,
    createdById: null,
    at,
    lines: [
      {
        id: `repo-line-${id}`,
        roomTypeId,
        physicalRoomId: null,
        occupancy: Occupancy.create({ adults: 2, children: 0 }),
        subtotal: Money.create({
          amountMinor: accommodationMinor,
          currency: "USD",
        }),
        nights: [...stay.nights()].map((night) => ({
          night,
          amount: Money.create({ amountMinor: 100, currency: "USD" }),
          source: "BASE",
          periodId: null,
          label: "Base",
        })),
      },
    ],
    ...overrides,
  };
}
