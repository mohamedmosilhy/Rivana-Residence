import type { CouponRedemptionStore } from "@/application/coupons";
import type { QueueReservationMessages } from "@/application/notifications";
import type { PaymentCallbackStore } from "@/application/payments";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import { success, type Result } from "@/application/shared/result";
import {
  auditEvent,
  type AuditAction,
  type AuditChanges,
} from "@/domain/audit";
import { reservationPaymentStatusFor } from "@/domain/payments";
import { ReservationStateMachine } from "@/domain/reservations";
import { localDateAt } from "@/domain/shared/zoned-time";

import { finishCancellation } from "./finish-cancellation";
import type {
  CancellationRequestStore,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import { refundAttemptKey } from "./refund-key";
import type { ReservationStorageContext } from "./storage-context";

/** What the gateway said about one refund attempt, from the call, a callback, or a lookup. */
export type RefundOutcome = Readonly<{
  paymentId: string;
  /** The idempotency key the attempt was sent with. */
  attemptKey: string;
  outcome: "SUCCEEDED" | "FAILED";
  providerRefundId?: string | undefined;
}>;

export type CompleteRefundContext = ReservationStorageContext &
  Readonly<{
    payments: Pick<PaymentCallbackStore, "findPayment" | "completeRefund">;
    cancellationRequests: Pick<
      CancellationRequestStore,
      "findActive" | "transition"
    >;
    redemptions: Pick<CouponRedemptionStore, "release">;
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<CompleteRefundContext>;
  reads: Readonly<{
    payments: Pick<PaymentCallbackStore, "findPayment">;
  }>;
  ids: IdGenerator;
  clock: Clock;
}>;

/**
 * The one step that finishes a refund (spec 0006 Decision 7). It runs from the
 * refund call's own answer, a verified refund callback, or the reconcile
 * lookup, in any order and any number of times: it changes something only when
 * the payment is `REFUND_PENDING` and the outcome carries the key of the
 * current attempt, checked under the reservation lock.
 *
 * - Success: payment `REFUNDED`; a booking waiting on this refund becomes
 *   `CANCELLED` (inventory and coupon released, hotel system flag as in S9) and
 *   its request `COMPLETED`.
 * - Failure: payment `REFUND_FAILED`, the booking stays `CONFIRMED` and reads
 *   as paid, its request `REFUND_FAILED`, and the branch is alerted.
 */
export class CompleteRefund {
  constructor(private readonly deps: Dependencies) {}

  /** Standalone run: reads the payment, locks its reservation, applies. */
  async execute(outcome: RefundOutcome): Promise<Result<{ applied: boolean }>> {
    const payment = await this.deps.reads.payments.findPayment(
      outcome.paymentId,
    );
    if (!payment) return success({ applied: false });
    return this.deps.unitOfWork.run(async (context) => {
      const locked = await context.reservations.lockById(
        payment.branchId,
        payment.reservationId,
      );
      if (!locked.ok) return locked;
      if (!locked.value) return success({ applied: false });
      return this.applyLocked(context, locked.value, outcome);
    });
  }

  /** Inside a transaction that already holds the reservation row lock. */
  async applyLocked(
    context: CompleteRefundContext,
    reservation: StoredReservation,
    outcome: RefundOutcome,
  ): Promise<Result<{ applied: boolean }>> {
    const payment = await context.payments.findPayment(outcome.paymentId);
    if (
      !payment ||
      payment.reservationId !== reservation.id ||
      payment.status !== "REFUND_PENDING" ||
      outcome.attemptKey !== refundAttemptKey(payment.id, payment.refundAttempt)
    )
      return success({ applied: false });

    const now = this.deps.clock.now();
    const request = await context.cancellationRequests.findActive(
      reservation.id,
    );
    const waiting = request?.status === "REFUND_PENDING" ? request : null;
    const record = <Action extends AuditAction>(
      action: Action,
      target: Readonly<{
        entityType: "Payment" | "Reservation" | "CancellationRequest";
        entityId: string;
      }>,
      changes: AuditChanges[Action],
    ) =>
      context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "SYSTEM",
          actorId: null,
          action,
          entityType: target.entityType,
          entityId: target.entityId,
          branchId: reservation.branchId,
          reason: null,
          changes,
        }),
      );

    if (outcome.outcome === "FAILED") {
      await context.payments.completeRefund(
        payment.id,
        "REFUND_FAILED",
        now,
        outcome.providerRefundId,
      );
      // A failed refund leaves the money captured, so the booking still reads as paid.
      await context.reservations.setPaymentStatus(
        reservation.branchId,
        reservation.id,
        reservationPaymentStatusFor("REFUND_FAILED"),
        now,
      );
      if (waiting)
        await context.cancellationRequests.transition({
          id: waiting.id,
          from: "REFUND_PENDING",
          to: "REFUND_FAILED",
          at: now,
        });
      await record(
        "payment.refund-failed",
        { entityType: "Payment", entityId: payment.id },
        {
          reservationId: reservation.id,
          refundAttempt: payment.refundAttempt,
          requestId: waiting?.id ?? null,
        },
      );
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "refund.staff-alert",
        refundMinor: payment.amountMinor,
      });
      return success({ applied: true });
    }

    await context.payments.completeRefund(
      payment.id,
      "REFUNDED",
      now,
      outcome.providerRefundId,
    );
    await context.reservations.setPaymentStatus(
      reservation.branchId,
      reservation.id,
      reservationPaymentStatusFor("REFUNDED"),
      now,
    );
    await record(
      "payment.refunded",
      { entityType: "Payment", entityId: payment.id },
      {
        reservationId: reservation.id,
        refundAttempt: payment.refundAttempt,
        requestId: waiting?.id ?? null,
      },
    );
    if (!waiting) return success({ applied: true });

    await context.cancellationRequests.transition({
      id: waiting.id,
      from: "REFUND_PENDING",
      to: "COMPLETED",
      at: now,
    });
    // The state machine wants the state after the refund (CX-5).
    const refunded = Object.assign({}, reservation, {
      paymentStatus: "REFUNDED" as const,
    });
    const transition = ReservationStateMachine.transition(
      {
        ...refunded,
        allUnitsAssigned: refunded.lines.every(
          (line) => line.physicalRoomId !== null,
        ),
      },
      "CANCEL_APPROVED",
      localDateAt(now, reservation.branchTimeZone),
    );
    // A booking that moved on while the refund ran (for example checked in)
    // keeps its status: the money is refunded and the request is finished.
    let cancelled = false;
    if (transition.allowed && waiting.decidedById) {
      const { stored, flagPmsUpdate } = await finishCancellation(
        context,
        refunded,
        { id: waiting.decidedById },
        this.deps.ids,
        now,
      );
      cancelled = true;
      await record(
        "reservation.cancelled",
        { entityType: "Reservation", entityId: reservation.id },
        {
          reference: reservation.reference.value,
          // A staff cancellation's own reason code is on its approval audit,
          // linked by `requestId` (no column stores it until T11's migration).
          reason: waiting.requestedBy === "GUEST" ? "GUEST_REQUEST" : "OTHER",
          noteProvided: false,
          couponReleased: reservation.couponId !== null,
          guestNotified:
            waiting.requestedBy === "GUEST" || waiting.decisionReason !== null,
          flagPmsUpdate,
          changeSeq: flagPmsUpdate ? stored.changeSeq : null,
          refunded: true,
          requestId: waiting.id,
        },
      );
      // A staff cancellation tells the guest only when staff chose to (reason stored).
      if (waiting.requestedBy === "GUEST" || waiting.decisionReason !== null)
        await context.messages.enqueue(reservation.branchId, reservation.id, {
          kind: "payment.refunded",
          refundMinor: payment.amountMinor,
        });
    }
    if (!cancelled)
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "refund.moved-on-alert",
        refundMinor: payment.amountMinor,
      });
    await record(
      "cancellation-request.completed",
      { entityType: "CancellationRequest", entityId: waiting.id },
      { reservationId: reservation.id, cancelled },
    );
    return success({ applied: true });
  }
}
