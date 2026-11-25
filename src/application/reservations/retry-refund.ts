import {
  type StaffPrincipal,
  authorize,
  authorizeBranch,
  branchScope,
  inBranchScope,
} from "@/application/auth";
import type {
  PaymentCallbackStore,
  PaymentReader,
  PaymentView,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";
import {
  failure,
  invalidTransition,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import type { PaymentStatus } from "@/domain/shared/types";

import type { CancellationRequestStore, ReservationUnitOfWork } from "./ports";
import { refundAttemptKey } from "./refund-key";
import type { RefundDispatcher, RefundRequest } from "./send-refund";
import type { ReservationStorageContext } from "./storage-context";
import {
  findStaffReservation,
  type StaffReservationReader,
} from "./staff-reservation-reads";

export type RetryRefundContext = ReservationStorageContext &
  Readonly<{
    payments: Pick<PaymentCallbackStore, "findPayment" | "startRefund">;
    cancellationRequests: Pick<
      CancellationRequestStore,
      "findActive" | "transition"
    >;
  }>;

const notFound = () => failure("NOT_FOUND", "This payment was not found.");

/**
 * S45. Starts a new refund attempt for a payment whose last attempt failed.
 * Only `REFUND_FAILED` can be retried, with a new attempt number (so a new
 * idempotency key), and staff may retry as often as they decide to. The call
 * itself runs after the commit.
 */
export class RetryRefund {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<RetryRefundContext>;
      reads: Readonly<{ payments: Pick<PaymentCallbackStore, "findPayment"> }>;
      refunds: Pick<RefundDispatcher, "send">;
      clock: Clock;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    paymentId: string,
  ): Promise<Result<{ paymentId: string; status: PaymentStatus }>> {
    const access = authorize(staff, "cancellations:decide");
    if (!access.ok) return access;
    const principal = access.value;
    if (paymentId.length === 0 || paymentId.length > 32) return notFound();
    const found = await this.deps.reads.payments.findPayment(paymentId);
    if (
      !found ||
      !inBranchScope(branchScope(principal), found.branchId) ||
      !authorizeBranch(principal, "cancellations:decide", found.branchId).ok
    )
      return notFound();

    const result = await this.deps.unitOfWork.run<{
      request: RefundRequest | null;
      attempt: number;
    }>(async (context) => {
      const locked = await context.reservations.lockById(
        found.branchId,
        found.reservationId,
      );
      if (!locked.ok) return locked;
      const reservation = locked.value;
      if (!reservation) return notFound();
      const payment = await context.payments.findPayment(paymentId);
      if (!payment || payment.reservationId !== reservation.id)
        return notFound();
      if (payment.status !== "REFUND_FAILED")
        return invalidTransition(
          payment.status,
          "Only a payment whose refund failed can be retried.",
        );
      // A booking that moved on (checked in, no show) is not refunded again.
      if (
        reservation.status !== "CONFIRMED" &&
        reservation.status !== "CANCELLED" &&
        reservation.status !== "PAYMENT_FAILED"
      )
        return invalidTransition(
          reservation.status,
          "This booking has moved on. Review it before refunding again.",
        );
      const now = this.deps.clock.now();
      const attempt = await context.payments.startRefund(payment.id, now);
      await context.reservations.setPaymentStatus(
        reservation.branchId,
        reservation.id,
        "REFUND_PENDING",
        now,
      );
      const waiting = await context.cancellationRequests.findActive(
        reservation.id,
      );
      if (waiting?.status === "REFUND_FAILED")
        await context.cancellationRequests.transition({
          id: waiting.id,
          from: "REFUND_FAILED",
          to: "REFUND_PENDING",
          at: now,
        });
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "payment.refund-requested",
          entityType: "Payment",
          entityId: payment.id,
          branchId: reservation.branchId,
          reason: null,
          changes: {
            reservationId: reservation.id,
            refundMinor: payment.amountMinor,
            refundAttempt: attempt,
            requestId: waiting?.id ?? null,
            trigger: "RETRY",
          },
        }),
      );
      return success({
        attempt,
        request: payment.providerTransactionId
          ? {
              paymentId: payment.id,
              providerTransactionId: payment.providerTransactionId,
              amountMinor: payment.amountMinor,
              currency: payment.currency,
              idempotencyKey: refundAttemptKey(payment.id, attempt),
            }
          : null,
      });
    });
    if (!result.ok) return result;
    if (result.value.request)
      await this.deps.refunds.send(result.value.request, result.value.attempt);
    const after = await this.deps.reads.payments.findPayment(paymentId);
    return success({ paymentId, status: after?.status ?? "REFUND_PENDING" });
  }
}

/** S44: the payments of one reservation, for staff who may read it. */
export class ListReservationPayments {
  constructor(
    private readonly deps: Readonly<{
      reads: Pick<StaffReservationReader, "findVisible">;
      payments: PaymentReader;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    reservationId: string,
  ): Promise<Result<{ items: readonly PaymentView[] }>> {
    const found = await findStaffReservation(
      this.deps.reads,
      staff,
      reservationId,
      "reservations:read",
    );
    if (!found.ok) return found;
    return success({
      items: await this.deps.payments.listForReservation(found.value.row.id),
    });
  }
}
