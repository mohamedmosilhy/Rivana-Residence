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

/** The per email cap uses the same numbers as the phone cap (Q-93, confirmed 2026-11-25). */
export const EMAIL_BOOKING_LIMITS = PHONE_BOOKING_LIMITS;
/** A website booking made with an email code for this normalized email (ADR 031). */
export type EmailBooking = Omit<PhoneBooking, "phone"> &
  Readonly<{ email: string }>;
type BookingLimitResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; code: "BOOKING_LIMIT_REACHED" }>;

/** Counts across all supplied branches; callers must not prefilter to the booking branch. */
export function checkPhoneBookingLimit(
  phone: PhoneNumber,
  bookings: readonly PhoneBooking[],
  requestedMethod: PaymentMethod,
  now: Date,
): BookingLimitResult {
  return checkLimit(
    bookings,
    (booking) => booking.phone.equals(phone),
    requestedMethod,
    now,
    PHONE_BOOKING_LIMITS,
  );
}

/**
 * The per email cap (ADR 031): the same rule as the phone cap, counted over
 * the website bookings verified by an email code for this email, across all
 * branches. The phone cap still applies to the typed phone as well.
 */
export function checkEmailBookingLimit(
  email: string,
  bookings: readonly EmailBooking[],
  requestedMethod: PaymentMethod,
  now: Date,
): BookingLimitResult {
  if (
    typeof email !== "string" ||
    email === "" ||
    email !== email.toLowerCase()
  )
    policyInputError("email");
  return checkLimit(
    bookings,
    (booking) => booking.email === email,
    requestedMethod,
    now,
    EMAIL_BOOKING_LIMITS,
  );
}

function checkLimit<T extends Omit<PhoneBooking, "phone">>(
  bookings: readonly T[],
  owned: (booking: T) => boolean,
  requestedMethod: PaymentMethod,
  now: Date,
  limits: typeof PHONE_BOOKING_LIMITS,
): BookingLimitResult {
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
    if (!owned(booking) || booking.source !== "WEBSITE") continue;
    if (
      booking.paymentMethod === "PAY_AT_HOTEL" &&
      booking.status === "CONFIRMED" &&
      booking.checkIn.compare(booking.branchToday) >= 0
    )
      upcoming++;
    if (
      booking.paymentMethod === "ONLINE" &&
      booking.status === "AWAITING_PAYMENT"
    ) {
      if (booking.holdExpiresAt === null) policyInputError("holdExpiresAt");
      if (booking.holdExpiresAt.getTime() > timestamp) holds++;
    }
  }
  const reached =
    requestedMethod === "PAY_AT_HOTEL"
      ? upcoming >= limits.upcomingPayAtHotel
      : holds >= limits.openPaymentHolds;
  return reached
    ? { allowed: false, code: "BOOKING_LIMIT_REACHED" }
    : { allowed: true };
}
