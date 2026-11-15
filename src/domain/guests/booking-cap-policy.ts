import { LocalDate } from "@/domain/shared/local-date";
import {
  RESERVATION_STATUSES,
  RESERVATION_SOURCES,
  PAYMENT_METHODS,
  type ReservationStatus,
  type ReservationSource,
  type PaymentMethod,
} from "@/domain/shared/types";
import type { PhoneNumber } from "./phone-number";
import { instant, policyInputError } from "./policy-values";

export const PHONE_BOOKING_LIMITS = Object.freeze({
  upcomingPayAtHotel: 2,
  openPaymentHolds: 1,
});
export type PhoneBooking = Readonly<{
  id: string;
  phone: PhoneNumber;
  source: ReservationSource;
  status: ReservationStatus;
  paymentMethod: PaymentMethod;
  checkIn: LocalDate;
  /** Derived by the caller from this record's branch zone and the injected clock (Q-78). */
  branchToday: LocalDate;
  holdExpiresAt: Date | null;
}>;

/** Counts across all supplied branches; callers must not prefilter to the booking branch. */
export function checkPhoneBookingLimit(
  phone: PhoneNumber,
  bookings: readonly PhoneBooking[],
  requestedMethod: PaymentMethod,
  now: Date,
):
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; code: "BOOKING_LIMIT_REACHED" }> {
  const timestamp = instant(now);
  if (!PAYMENT_METHODS.includes(requestedMethod))
    policyInputError("paymentMethod");
  const ids = new Set<string>();
  let upcoming = 0,
    holds = 0;
  for (const booking of bookings) {
    if (
      !booking.id ||
      ids.has(booking.id) ||
      !RESERVATION_SOURCES.includes(booking.source) ||
      !RESERVATION_STATUSES.includes(booking.status) ||
      !PAYMENT_METHODS.includes(booking.paymentMethod) ||
      !(booking.checkIn instanceof LocalDate) ||
      !(booking.branchToday instanceof LocalDate)
    )
      policyInputError("bookings");
    ids.add(booking.id);
    if (booking.holdExpiresAt !== null)
      instant(booking.holdExpiresAt, "holdExpiresAt");
    if (!booking.phone.equals(phone) || booking.source !== "WEBSITE") continue;
    if (
      booking.paymentMethod === "PAY_AT_HOTEL" &&
      booking.status === "CONFIRMED" &&
      booking.checkIn.compare(booking.branchToday) >= 0
    )
      upcoming++;
    if (
      booking.paymentMethod === "PAYMOB" &&
      booking.status === "AWAITING_PAYMENT"
    ) {
      if (booking.holdExpiresAt === null) policyInputError("holdExpiresAt");
      if (booking.holdExpiresAt.getTime() > timestamp) holds++;
    }
  }
  const reached =
    requestedMethod === "PAY_AT_HOTEL"
      ? upcoming >= PHONE_BOOKING_LIMITS.upcomingPayAtHotel
      : holds >= PHONE_BOOKING_LIMITS.openPaymentHolds;
  return reached
    ? { allowed: false, code: "BOOKING_LIMIT_REACHED" }
    : { allowed: true };
}
