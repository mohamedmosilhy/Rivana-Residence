import { DomainValidationError } from "@/domain/shared/domain-error";
import { LocalDate } from "@/domain/shared/local-date";
import { StayRange } from "@/domain/shared/stay-range";
import {
  RESERVATION_SOURCES,
  PAYMENT_METHODS,
  type ReservationSource,
  RESERVATION_STATUSES,
  type ReservationStatus,
  type PaymentMethod,
  type ReservationPaymentStatus,
  RESERVATION_PAYMENT_STATUSES,
} from "@/domain/shared/types";

export type ReservationState = Readonly<{
  status: ReservationStatus;
  stay: StayRange;
  paymentMethod: PaymentMethod;
  paymentStatus: ReservationPaymentStatus;
  allUnitsAssigned: boolean;
}>;
export type ReservationAction =
  | "CANCEL_UNPAID"
  | "CHECK_IN"
  | "CHECK_OUT"
  | "MARK_NO_SHOW"
  // M9: the caller proves the fact (verified callback, expiry, refund
  // confirmation, every unit free under lock); this only checks the lifecycle.
  | "PAYMENT_SUCCEEDED"
  | "HOLD_EXPIRED"
  | "CONFIRM_LATE_PAYMENT"
  | "CANCEL_APPROVED";
export type TransitionResult =
  | Readonly<{
      allowed: true;
      status: ReservationStatus;
      stay: StayRange;
      consumesInventory: boolean;
    }>
  | Readonly<{
      allowed: false;
      code: "INVALID_TRANSITION";
      status: ReservationStatus;
    }>;

export function consumesInventory(status: ReservationStatus): boolean {
  if (!RESERVATION_STATUSES.includes(status))
    throw new DomainValidationError("The reservation status is invalid.", [
      { path: "status", message: "Supply a supported reservation status." },
    ]);
  return (
    status === "AWAITING_PAYMENT" ||
    status === "CONFIRMED" ||
    status === "CHECKED_IN" ||
    status === "CHECKED_OUT"
  );
}
export function isTerminalReservation(status: ReservationStatus): boolean {
  consumesInventory(status); // Validate before deriving a terminal flag.
  return (
    status === "PAYMENT_FAILED" ||
    status === "CANCELLED" ||
    status === "CHECKED_OUT" ||
    status === "NO_SHOW"
  );
}

/** Pure lifecycle decisions only. The caller still authorizes and writes under a transaction. */
export class ReservationStateMachine {
  static create(
    source: ReservationSource,
    paymentMethod: PaymentMethod,
  ):
    | Readonly<{
        allowed: true;
        status: "CONFIRMED" | "AWAITING_PAYMENT";
        consumesInventory: true;
      }>
    | Readonly<{ allowed: false; code: "PAYMENT_METHOD_UNAVAILABLE" }> {
    if (
      !RESERVATION_SOURCES.includes(source) ||
      !PAYMENT_METHODS.includes(paymentMethod)
    )
      throw new DomainValidationError("The creation input is invalid.", [
        {
          path: "creation",
          message: "Supply a supported source and payment method.",
        },
      ]);
    if (paymentMethod === "PAY_AT_HOTEL")
      return Object.freeze({
        allowed: true,
        status: "CONFIRMED",
        consumesInventory: true,
      });
    // PY-1, PY-2: only website guests prepay; the booking holds its units until paid.
    return source === "WEBSITE"
      ? Object.freeze({
          allowed: true,
          status: "AWAITING_PAYMENT",
          consumesInventory: true,
        })
      : { allowed: false, code: "PAYMENT_METHOD_UNAVAILABLE" };
  }

  static transition(
    state: ReservationState,
    action: ReservationAction,
    today: LocalDate,
  ): TransitionResult {
    consumesInventory(state.status);
    if (
      !RESERVATION_PAYMENT_STATUSES.includes(state.paymentStatus) ||
      !PAYMENT_METHODS.includes(state.paymentMethod) ||
      typeof state.allUnitsAssigned !== "boolean" ||
      !(state.stay instanceof StayRange) ||
      !(today instanceof LocalDate)
    )
      throw new DomainValidationError("The reservation state is invalid.", [
        {
          path: "state",
          message: "Supply supported payment values and assignment facts.",
        },
      ]);
    const refuse = (): TransitionResult => ({
      allowed: false,
      code: "INVALID_TRANSITION",
      status: state.status,
    });
    let target: ReservationStatus;
    let stay = state.stay;
    switch (action) {
      case "CANCEL_UNPAID":
        if (
          state.status !== "CONFIRMED" ||
          state.paymentMethod !== "PAY_AT_HOTEL" ||
          state.paymentStatus !== "NOT_REQUIRED"
        )
          return refuse();
        target = "CANCELLED";
        break;
      case "CHECK_IN":
        if (
          state.status !== "CONFIRMED" ||
          today.compare(stay.checkIn) < 0 ||
          !state.allUnitsAssigned
        )
          return refuse();
        target = "CHECKED_IN";
        break;
      case "MARK_NO_SHOW":
        if (state.status !== "CONFIRMED" || today.compare(stay.checkIn) < 0)
          return refuse();
        target = "NO_SHOW";
        break;
      case "PAYMENT_SUCCEEDED":
        if (
          state.status !== "AWAITING_PAYMENT" ||
          state.paymentMethod !== "ONLINE"
        )
          return refuse();
        target = "CONFIRMED";
        break;
      case "HOLD_EXPIRED":
        // Q-95: only expiry or a session closed unpaid, never a declined attempt.
        if (
          state.status !== "AWAITING_PAYMENT" ||
          state.paymentMethod !== "ONLINE"
        )
          return refuse();
        target = "PAYMENT_FAILED";
        break;
      case "CONFIRM_LATE_PAYMENT":
        // PY-5: the caller has checked under lock that every unit is free.
        if (
          state.status !== "PAYMENT_FAILED" ||
          state.paymentMethod !== "ONLINE"
        )
          return refuse();
        target = "CONFIRMED";
        break;
      case "CANCEL_APPROVED":
        // CX-5: an unpaid pay-at-hotel booking cancels at once. A paid online
        // booking cancels only once the gateway confirmed the refund, so the
        // caller passes the state *after* the refund (`REFUNDED`), never `PAID`.
        if (
          state.status !== "CONFIRMED" ||
          !(
            (state.paymentMethod === "PAY_AT_HOTEL" &&
              state.paymentStatus === "NOT_REQUIRED") ||
            (state.paymentMethod === "ONLINE" &&
              state.paymentStatus === "REFUNDED")
          )
        )
          return refuse();
        target = "CANCELLED";
        break;
      case "CHECK_OUT":
        if (state.status !== "CHECKED_IN" || today.compare(stay.checkIn) <= 0)
          return refuse();
        if (today.compare(stay.checkOut) < 0)
          stay = StayRange.create(stay.checkIn, today);
        target = "CHECKED_OUT";
        break;
      default:
        return refuse();
    }
    // Deliberately returns no price fields: early departure never rewrites the snapshot (Q-76).
    return Object.freeze({
      allowed: true,
      status: target,
      stay,
      consumesInventory: consumesInventory(target),
    });
  }
}

export function canModifyReservationStay(status: ReservationStatus): boolean {
  consumesInventory(status);
  return status === "CONFIRMED";
}
export function canEditReservationGuest(status: ReservationStatus): boolean {
  return !isTerminalReservation(status);
}
