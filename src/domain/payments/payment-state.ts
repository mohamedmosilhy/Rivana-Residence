import { DomainValidationError } from "@/domain/shared/domain-error";
import {
  PAYMENT_STATUSES,
  RESERVATION_STATUSES,
  type PaymentStatus,
  type ReservationPaymentStatus,
  type ReservationStatus,
} from "@/domain/shared/types";

/** The gateway charges one currency (Q-54). */
export const PAYMENT_CURRENCY = "USD";

// PY-4, PY-5, PY-7: a late success may follow EXPIRED or FAILED; a refund is
// always the full captured amount and can be retried after a failure.
const NEXT: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  INITIATED: ["SUCCEEDED", "EXPIRED", "FAILED"],
  SUCCEEDED: ["REFUND_PENDING"],
  EXPIRED: ["SUCCEEDED"],
  FAILED: ["SUCCEEDED"],
  REFUND_PENDING: ["REFUNDED", "REFUND_FAILED"],
  REFUND_FAILED: ["REFUND_PENDING"],
  REFUNDED: [],
};

function assertPaymentStatus(value: unknown, path: string): void {
  if (!PAYMENT_STATUSES.includes(value as PaymentStatus))
    throw new DomainValidationError("The payment status is invalid.", [
      { path, message: "Supply a supported payment status." },
    ]);
}

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  assertPaymentStatus(from, "from");
  assertPaymentStatus(to, "to");
  return NEXT[from].includes(to);
}

/** What the reservation row's `paymentStatus` shows for a payment (spec 0006, data model). */
export function reservationPaymentStatusFor(
  status: PaymentStatus,
): ReservationPaymentStatus {
  assertPaymentStatus(status, "status");
  switch (status) {
    case "INITIATED":
      return "AWAITING";
    case "EXPIRED":
    case "FAILED":
      return "FAILED";
    // A failed refund leaves the money captured, so the booking still reads as paid.
    case "SUCCEEDED":
    case "REFUND_FAILED":
      return "PAID";
    case "REFUND_PENDING":
      return "REFUND_PENDING";
    case "REFUNDED":
      return "REFUNDED";
  }
}

export type PaymentAmount = Readonly<{ amountMinor: number; currency: string }>;

const isPositiveMinor = (value: unknown): boolean =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/**
 * PY-3: a verified event applies only when amount and currency equal the
 * payment's. The payment is our own record, so a malformed amount there is a
 * bug and throws. The event is outside data: a malformed amount is a mismatch
 * (false), never an exception, so the callback can still answer normally.
 */
export function matchesPayment(
  payment: PaymentAmount,
  event: PaymentAmount,
): boolean {
  if (!isPositiveMinor(payment.amountMinor))
    throw new DomainValidationError("The amount is invalid.", [
      {
        path: "payment.amountMinor",
        message: "Supply a positive integer in minor units.",
      },
    ]);
  return (
    isPositiveMinor(event.amountMinor) &&
    payment.currency === PAYMENT_CURRENCY &&
    event.currency === payment.currency &&
    event.amountMinor === payment.amountMinor
  );
}

export type PaymentSuccessDecision =
  | "CONFIRM"
  | "CONFIRM_LATE"
  | "REFUND_AUTOMATICALLY"
  | "IGNORE_DUPLICATE";

/**
 * PY-3…5, Q-63: what to do with a verified success whose amount already
 * matched. `unitsFree` is only read when the hold was released, and the caller
 * must compute it under the listing locks.
 */
export function decidePaymentSuccess(input: {
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentStatus;
  unitsFree: boolean;
}): PaymentSuccessDecision {
  assertPaymentStatus(input.paymentStatus, "paymentStatus");
  if (
    !RESERVATION_STATUSES.includes(input.reservationStatus) ||
    typeof input.unitsFree !== "boolean"
  )
    throw new DomainValidationError("The success input is invalid.", [
      {
        path: "input",
        message: "Supply a reservation status and whether units are free.",
      },
    ]);
  // PY-4: a payment that already succeeded, or moved on to refund, is not applied twice.
  if (!canTransitionPayment(input.paymentStatus, "SUCCEEDED"))
    return "IGNORE_DUPLICATE";
  if (input.reservationStatus === "AWAITING_PAYMENT") return "CONFIRM";
  if (input.reservationStatus === "PAYMENT_FAILED" && input.unitsFree)
    return "CONFIRM_LATE";
  return "REFUND_AUTOMATICALLY";
}
