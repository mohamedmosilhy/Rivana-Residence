import { DomainValidationError } from "@/domain/shared/domain-error";
import {
  CANCELLATION_REQUEST_STATUSES,
  PAYMENT_METHODS,
  RESERVATION_PAYMENT_STATUSES,
  RESERVATION_STATUSES,
  type CancellationClosedReason,
  type CancellationRequestStatus,
  type PaymentMethod,
  type ReservationPaymentStatus,
  type ReservationStatus,
} from "@/domain/shared/types";
import { CancellationDeadline } from "./cancellation-deadline";

export const REQUEST_REASON_MAX = 500;

// CX-3…5: `OPEN → APPROVED → COMPLETED` when unpaid; paid goes through the refund.
const NEXT: Readonly<
  Record<CancellationRequestStatus, readonly CancellationRequestStatus[]>
> = {
  OPEN: ["APPROVED", "REJECTED", "CLOSED"],
  APPROVED: ["COMPLETED", "REFUND_PENDING"],
  REFUND_PENDING: ["COMPLETED", "REFUND_FAILED"],
  REFUND_FAILED: ["REFUND_PENDING"],
  REJECTED: [],
  COMPLETED: [],
  CLOSED: [],
};

function assertRequestStatus(value: unknown, path: string): void {
  if (!CANCELLATION_REQUEST_STATUSES.includes(value as never))
    throw new DomainValidationError("The request status is invalid.", [
      { path, message: "Supply a supported request status." },
    ]);
}

export function canTransitionCancellationRequest(
  from: CancellationRequestStatus,
  to: CancellationRequestStatus,
): boolean {
  assertRequestStatus(from, "from");
  assertRequestStatus(to, "to");
  return NEXT[from].includes(to);
}

function assertReservationFacts(status: ReservationStatus, now: Date): void {
  if (!RESERVATION_STATUSES.includes(status) || !Number.isFinite(now.getTime()))
    throw new DomainValidationError("The request input is invalid.", [
      { path: "input", message: "Supply a reservation status and instant." },
    ]);
}

export type GuestRequestRefusal =
  | "NOT_CONFIRMED"
  | "REQUEST_ALREADY_OPEN"
  | "REFUND_IN_PROGRESS"
  | "DEADLINE_PASSED"
  | "PHONE_BLOCKED";
export type GuestRequestDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; code: GuestRequestRefusal }>;

/**
 * CX-2, GC-2: a request still in play. After approval the booking stays
 * `CONFIRMED` until the refund completes (and stays so if it fails), so
 * `APPROVED`, `REFUND_PENDING` and `REFUND_FAILED` count as well as `OPEN`.
 * Only `REJECTED`, `COMPLETED` and `CLOSED` are finished.
 */
export const ACTIVE_CANCELLATION_REQUEST_STATUSES: readonly CancellationRequestStatus[] =
  Object.freeze([
    "OPEN",
    "APPROVED",
    "REFUND_PENDING",
    "REFUND_FAILED",
  ] as const);

export function isActiveRequest(status: CancellationRequestStatus): boolean {
  assertRequestStatus(status, "status");
  return ACTIVE_CANCELLATION_REQUEST_STATUSES.includes(status);
}

type RequestFacts = {
  reservationStatus: ReservationStatus;
  paymentStatus: ReservationPaymentStatus;
  /** Statuses of every cancellation and change request of the reservation. */
  requestStatuses: readonly CancellationRequestStatus[];
  changeRequestOpen?: boolean | undefined;
  cancellationRequestActive?: boolean | undefined;
  phoneBlocked: boolean;
  now: Date;
};

function checkRequestFacts(input: RequestFacts): GuestRequestDecision {
  assertReservationFacts(input.reservationStatus, input.now);
  if (
    !RESERVATION_PAYMENT_STATUSES.includes(input.paymentStatus) ||
    typeof input.phoneBlocked !== "boolean"
  )
    throw new DomainValidationError("The request input is invalid.", [
      { path: "input", message: "Supply a payment status and a phone flag." },
    ]);
  const active =
    input.changeRequestOpen ||
    input.cancellationRequestActive ||
    input.requestStatuses.some(isActiveRequest);
  // Q-75: a blocked phone cannot start requests or changes.
  if (input.phoneBlocked) return { allowed: false, code: "PHONE_BLOCKED" };
  if (input.reservationStatus !== "CONFIRMED")
    return { allowed: false, code: "NOT_CONFIRMED" };
  if (active) return { allowed: false, code: "REQUEST_ALREADY_OPEN" };
  // A refund the gateway has not finished must settle first.
  if (input.paymentStatus === "REFUND_PENDING")
    return { allowed: false, code: "REFUND_IN_PROGRESS" };
  return { allowed: true };
}

/**
 * CX-1, CX-2, CX-6, Q-64: a guest may request cancellation of a `CONFIRMED`
 * reservation with no active request (cancellation or change) before the
 * deadline. Pass the deadline computed now from the reservation's current check-in.
 */
export function canRequestCancellation(
  input: RequestFacts & { deadline: Date | null },
): GuestRequestDecision {
  const facts = checkRequestFacts(input);
  if (!facts.allowed) return facts;
  return CancellationDeadline.isOpen(input.deadline, input.now)
    ? { allowed: true }
    : { allowed: false, code: "DEADLINE_PASSED" };
}

/**
 * GC-2: a guest change needs the same facts as a cancellation request, and the
 * deadline open for both the current and the new arrival date.
 */
export function canGuestChange(
  input: RequestFacts & {
    currentDeadline: Date | null;
    newDeadline: Date | null;
  },
): GuestRequestDecision {
  const current = canRequestCancellation({
    ...input,
    deadline: input.currentDeadline,
  });
  if (!current.allowed) return current;
  return CancellationDeadline.isOpen(input.newDeadline, input.now)
    ? { allowed: true }
    : { allowed: false, code: "DEADLINE_PASSED" };
}

export type ChangeApplication = "APPLY_NOW" | "REQUEST_APPROVAL";

/**
 * GC-4, Q-85: a pay-at-hotel change applies at once. A paid online change
 * applies at once only when the new total equals the total already paid;
 * otherwise it becomes a request and holds no inventory.
 */
export function decideChangeApplication(input: {
  paymentMethod: PaymentMethod;
  paidTotalMinor: number;
  newTotalMinor: number;
}): ChangeApplication {
  if (
    !PAYMENT_METHODS.includes(input.paymentMethod) ||
    !Number.isSafeInteger(input.paidTotalMinor) ||
    !Number.isSafeInteger(input.newTotalMinor) ||
    input.paidTotalMinor < 0 ||
    input.newTotalMinor < 0
  )
    throw new DomainValidationError("The change input is invalid.", [
      { path: "input", message: "Supply a payment method and totals." },
    ]);
  if (input.paymentMethod === "PAY_AT_HOTEL") return "APPLY_NOW";
  return input.paidTotalMinor === input.newTotalMinor
    ? "APPLY_NOW"
    : "REQUEST_APPROVAL";
}

export type ApprovalPlan = "CANCEL_NOW" | "REFUND_FIRST" | "NOT_APPROVABLE";

/**
 * CX-5: approving an unpaid booking cancels at once; approving a paid one
 * starts a full refund and cancels only when the gateway confirms it. Any
 * other payment state cannot be approved.
 */
export function planApproval(input: {
  reservationStatus: ReservationStatus;
  paymentStatus: ReservationPaymentStatus;
}): ApprovalPlan {
  if (
    !RESERVATION_STATUSES.includes(input.reservationStatus) ||
    !RESERVATION_PAYMENT_STATUSES.includes(input.paymentStatus)
  )
    throw new DomainValidationError("The approval input is invalid.", [
      { path: "input", message: "Supply supported status values." },
    ]);
  if (input.reservationStatus !== "CONFIRMED") return "NOT_APPROVABLE";
  if (input.paymentStatus === "NOT_REQUIRED") return "CANCEL_NOW";
  if (input.paymentStatus === "PAID") return "REFUND_FIRST";
  return "NOT_APPROVABLE";
}

/** CX-4 (and GC-5): a rejection needs a reason, which the guest is sent. */
export function parseRejectionReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length === 0 || reason.length > REQUEST_REASON_MAX)
    throw new DomainValidationError("The rejection reason is invalid.", [
      {
        path: "reason",
        message: `Supply a reason of 1 to ${REQUEST_REASON_MAX} characters.`,
      },
    ]);
  return reason;
}

export type StaffTerminalAction = "CANCEL" | "MARK_NO_SHOW" | "CHECK_IN";

/** Q-96: the closure reason recorded when a staff action ends an open request. */
export function closedReasonForStaffAction(
  action: StaffTerminalAction,
): CancellationClosedReason {
  switch (action) {
    case "CANCEL":
      return "STAFF_CANCELLED";
    case "MARK_NO_SHOW":
      return "NO_SHOW";
    case "CHECK_IN":
      return "CHECKED_IN";
    default:
      throw new DomainValidationError("The staff action is invalid.", [
        { path: "action", message: "Supply a supported staff action." },
      ]);
  }
}

/**
 * M9-T8 review: while a cancellation refund is on its way to the guest, the
 * guest cannot also arrive. Check in and no show wait until the refund
 * finishes (the booking is then cancelled) or fails (staff decide). A failed
 * refund does not block, so the front desk is never stuck.
 */
export function refundBlocksArrival(input: {
  paymentStatus: ReservationPaymentStatus;
  activeRequestStatus: CancellationRequestStatus | null;
}): boolean {
  if (!RESERVATION_PAYMENT_STATUSES.includes(input.paymentStatus))
    throw new DomainValidationError("The payment status is invalid.", [
      { path: "paymentStatus", message: "Supply a supported payment status." },
    ]);
  if (input.activeRequestStatus !== null)
    assertRequestStatus(input.activeRequestStatus, "activeRequestStatus");
  return (
    input.paymentStatus === "REFUND_PENDING" ||
    input.activeRequestStatus === "APPROVED" ||
    input.activeRequestStatus === "REFUND_PENDING"
  );
}
