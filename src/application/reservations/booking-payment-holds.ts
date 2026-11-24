import type { AuditLog } from "@/application/audit";
import type { CouponRedemptionStore } from "@/application/coupons";
import type { QueueReservationMessages } from "@/application/notifications";
import type {
  BookingPayment,
  BookingPaymentStore,
} from "@/application/payments";
import { success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { HoldPolicy } from "@/domain/payments";

import type { ReservationRepository, StoredReservation } from "./ports";

export type HoldContext = Readonly<{
  reservations: Pick<
    ReservationRepository,
    "lockById" | "findOverdueHoldIds" | "markPaymentFailed"
  >;
  payments: BookingPaymentStore;
  redemptions: Pick<CouponRedemptionStore, "release">;
  messages: Pick<QueueReservationMessages, "enqueue" | "discardHeld">;
  audit: AuditLog;
}>;

/** Call under the listing locks, before reading inventory or coupon use. */
export async function expireListingPaymentHolds(
  context: HoldContext,
  branchId: string,
  roomTypeIds: readonly string[],
  at: Date,
): Promise<Result<void>> {
  const ids = await context.reservations.findOverdueHoldIds(
    branchId,
    roomTypeIds,
    at,
  );
  for (const id of ids) {
    const expired = await expireHoldIfOverdue(context, branchId, id, at);
    if (!expired.ok) return expired;
  }
  return success(undefined);
}

/**
 * Locks the reservation row, re-checks that it is still an overdue hold, and
 * ends it as `EXPIRED`. Returns whether it expired. Only the reservation lock
 * is taken: a release never takes a listing lock (spec 0006 Decision 5).
 */
export async function expireHoldIfOverdue(
  context: HoldContext,
  branchId: string,
  id: string,
  at: Date,
): Promise<Result<boolean>> {
  const locked = await context.reservations.lockById(branchId, id);
  if (!locked.ok) return locked;
  const reservation = locked.value;
  if (
    !reservation ||
    reservation.status !== "AWAITING_PAYMENT" ||
    !reservation.holdExpiresAt ||
    !HoldPolicy.isExpired(reservation.holdExpiresAt, at)
  )
    return success(false);
  const payment = await context.payments.findInitiated(id);
  if (!payment)
    throw new Error("An awaiting reservation has no initiated payment.");
  await endBookingPaymentHold(context, reservation, payment, "EXPIRED", at);
  return success(true);
}

/** Caller holds the reservation lock and has checked the reservation and payment states. */
export async function endBookingPaymentHold(
  context: HoldContext,
  reservation: StoredReservation,
  payment: BookingPayment,
  status: "FAILED" | "EXPIRED",
  at: Date,
) {
  const { id, branchId, holdExpiresAt } = reservation;
  if (!holdExpiresAt)
    throw new Error("An awaiting reservation has no hold deadline.");
  await context.reservations.markPaymentFailed(branchId, id, at);
  await context.payments.end(payment.id, status, at);
  await context.redemptions.release(id, at);
  if (status === "FAILED") await context.messages.discardHeld(id);
  await context.messages.enqueue(branchId, id, {
    kind: "reservation.payment-not-completed",
    holdExpiresAt,
  });
  await context.audit.append(
    auditEvent({
      occurredAt: at,
      actorType: "SYSTEM",
      actorId: null,
      action: status === "EXPIRED" ? "payment.expired" : "payment.failed",
      entityType: "Payment",
      entityId: payment.id,
      branchId,
      reason: null,
      changes: { reservationId: id, from: "INITIATED", to: status },
    }),
  );
}
