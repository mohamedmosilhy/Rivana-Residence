import { type StaffPrincipal, authorizeBranch } from "@/application/auth";
import type { PaymentCallbackStore } from "@/application/payments";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalidTransition,
  staleVersion,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { planApproval } from "@/domain/reservations";

import {
  closeGuestRequests,
  type CloseGuestRequestsContext,
} from "./close-cancellation-request";
import type {
  CancellationRequestStore,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import {
  CANCELLATION_REASON_TEXT,
  type CancellationReason,
} from "./cancel-reservation";
import { refundAttemptKey } from "./refund-key";
import type { RefundDispatcher, RefundRequest } from "./send-refund";
import type { ReservationStorageContext } from "./storage-context";

export type CancelPaidReservationContext = ReservationStorageContext &
  CloseGuestRequestsContext &
  Readonly<{
    cancellationRequests: Pick<
      CancellationRequestStore,
      "closeOpen" | "findActive" | "createApproved" | "transition"
    >;
    payments: Pick<PaymentCallbackStore, "findPaidPayment" | "startRefund">;
  }>;

type Plan = Readonly<{ request: RefundRequest | null; attempt: number }>;

/**
 * S9 for a paid booking (Q-62: Manager and Admin only). It records an already
 * approved staff request and starts the same refund the guest path uses
 * (spec 0006 D-E). The booking is cancelled only when the gateway confirms the
 * refund. The guest hears "cancelled and refunded" when staff chose to tell them, and
 * only once the refund succeeded.
 */
export class CancelPaidReservation {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<CancelPaidReservationContext>;
      refunds: Pick<RefundDispatcher, "send">;
      ids: IdGenerator;
      clock: Clock;
    }>,
  ) {}

  async execute(
    staff: StaffPrincipal,
    row: StoredReservation,
    expectedVersion: number | null,
    input: Readonly<{
      reason: CancellationReason;
      note: string | null;
      notifyGuest: boolean;
    }>,
  ): Promise<Result<void>> {
    // The capability that separates a Manager from a Receptionist (AC-8).
    const access = authorizeBranch(
      staff,
      "reservations:cancel-paid",
      row.branchId,
    );
    if (!access.ok) return access;
    const principal = access.value;
    if (expectedVersion === null)
      return failure("PRECONDITION_REQUIRED", "Send an If-Match header.");

    const result = await this.deps.unitOfWork.run<Plan>(async (context) => {
      const locked = await context.reservations.lockById(row.branchId, row.id);
      if (!locked.ok) return locked;
      const current = locked.value;
      if (!current)
        return failure("NOT_FOUND", "This reservation was not found.");
      if (current.version !== expectedVersion)
        return staleVersion(current.version);
      if (
        planApproval({
          reservationStatus: current.status,
          paymentStatus: current.paymentStatus,
        }) !== "REFUND_FIRST"
      )
        return invalidTransition(
          current.status,
          current.paymentStatus === "REFUND_PENDING"
            ? "A refund for this reservation is already in progress."
            : "This reservation cannot be cancelled with a refund.",
        );
      const active = await context.cancellationRequests.findActive(current.id);
      const now = this.deps.clock.now();
      // A guest request that is still open is superseded by this staff action (Q-96).
      if (active && active.status !== "OPEN")
        return invalidTransition(
          current.status,
          "A cancellation for this reservation is already in progress.",
        );
      const payment = await context.payments.findPaidPayment(current.id);
      if (!payment)
        return invalidTransition(
          current.status,
          "No successful payment was found to refund.",
        );
      await closeGuestRequests(context, current, "CANCEL", principal.id, now);
      const requestId = this.deps.ids.next();
      await context.cancellationRequests.createApproved({
        id: requestId,
        reservationId: current.id,
        staffId: principal.id,
        cancelReason: input.reason,
        notifyGuest: input.notifyGuest,
        // The previous release can still finish the refund during deployment.
        legacyDecisionReason: input.notifyGuest
          ? CANCELLATION_REASON_TEXT[input.reason]
          : null,
        at: now,
      });
      await context.cancellationRequests.transition({
        id: requestId,
        from: "APPROVED",
        to: "REFUND_PENDING",
        at: now,
      });
      const attempt = await context.payments.startRefund(payment.id, now);
      await context.reservations.setPaymentStatus(
        current.branchId,
        current.id,
        "REFUND_PENDING",
        now,
      );
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "cancellation-request.approved",
          entityType: "CancellationRequest",
          entityId: requestId,
          branchId: current.branchId,
          reason: input.note,
          changes: {
            reservationId: current.id,
            requestedBy: "STAFF",
            plan: "REFUND_FIRST",
            noteProvided: input.note !== null,
            cancelReason: input.reason,
          },
        }),
      );
      await context.audit.append(
        auditEvent({
          occurredAt: now,
          actorType: "STAFF",
          actorId: principal.id,
          action: "payment.refund-requested",
          entityType: "Payment",
          entityId: payment.id,
          branchId: current.branchId,
          reason: null,
          changes: {
            reservationId: current.id,
            refundMinor: payment.amountMinor,
            refundAttempt: attempt,
            requestId,
            trigger: "STAFF_CANCELLATION",
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
    return success(undefined);
  }
}
