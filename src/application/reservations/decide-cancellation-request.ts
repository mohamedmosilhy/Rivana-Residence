import {
  type BranchScope,
  type StaffPrincipal,
  authorize,
  authorizeBranch,
  branchScope,
  inBranchScope,
} from "@/application/auth";
import type { CouponRedemptionStore } from "@/application/coupons";
import type { QueueReservationMessages } from "@/application/notifications";
import type { PaymentCallbackStore } from "@/application/payments";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import {
  failure,
  invalid,
  invalidTransition,
  success,
  type Result,
} from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import {
  parseRejectionReason,
  planApproval,
  ReservationStateMachine,
} from "@/domain/reservations";
import { DomainValidationError } from "@/domain/shared/domain-error";
import { localDateAt } from "@/domain/shared/zoned-time";
import type { CancellationRequestStatus } from "@/domain/shared/types";

import { finishCancellation } from "./finish-cancellation";
import type {
  CancellationRequestListItem,
  CancellationRequestReader,
  CancellationRequestStore,
  ReservationUnitOfWork,
} from "./ports";
import { refundAttemptKey } from "./refund-key";
import type { RefundDispatcher, RefundRequest } from "./send-refund";
import type { ReservationStorageContext } from "./storage-context";

export type DecideCancellationContext = ReservationStorageContext &
  Readonly<{
    cancellationRequests: Pick<
      CancellationRequestStore,
      "findById" | "transition"
    >;
    payments: Pick<PaymentCallbackStore, "findPaidPayment" | "startRefund">;
    redemptions: Pick<CouponRedemptionStore, "release">;
    messages: Pick<QueueReservationMessages, "enqueue">;
  }>;

export type DecisionResult = Readonly<{
  id: string;
  reservationId: string;
  branchId: string;
  status: CancellationRequestStatus;
  /** True when a refund was started: the booking is cancelled once the gateway confirms. */
  refundStarted: boolean;
}>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<DecideCancellationContext>;
  reader: Pick<CancellationRequestReader, "findById">;
  refunds: Pick<RefundDispatcher, "send">;
  ids: IdGenerator;
  clock: Clock;
}>;

const NOTE_MAX = 500;
const notFound = () =>
  failure("NOT_FOUND", "This cancellation request was not found.");

type Plan =
  | Readonly<{ kind: "DONE" }>
  | Readonly<{ kind: "REFUND"; request: RefundRequest; attempt: number }>;

/**
 * S18 and S19. The manager (of the branch) or an admin decides an `OPEN`
 * request. The reservation row is locked first, the request is re-read under
 * that lock, and every write commits together. A paid approval only starts the
 * refund: the booking is cancelled by `CompleteRefund` when the gateway says
 * the money went back. The refund call itself runs after the commit.
 */
export class DecideCancellationRequest {
  constructor(private readonly deps: Dependencies) {}

  approve(
    staff: StaffPrincipal | null,
    id: string,
    input: Readonly<{ note?: string | undefined }>,
  ) {
    return this.decide(staff, id, { kind: "APPROVE", note: input.note });
  }

  reject(
    staff: StaffPrincipal | null,
    id: string,
    input: Readonly<{ reason: string }>,
  ) {
    return this.decide(staff, id, { kind: "REJECT", reason: input.reason });
  }

  private async decide(
    staff: StaffPrincipal | null,
    id: string,
    decision:
      | Readonly<{ kind: "APPROVE"; note: string | undefined }>
      | Readonly<{ kind: "REJECT"; reason: string }>,
  ): Promise<Result<DecisionResult>> {
    const access = authorize(staff, "cancellations:decide");
    if (!access.ok) return access;
    const principal = access.value;
    if (id.length === 0 || id.length > 32) return notFound();
    const found = await this.deps.reader.findById(id);
    // A request of another branch looks like a missing one.
    if (
      !found ||
      !inBranchScope(branchScope(principal), found.branchId) ||
      !authorizeBranch(principal, "cancellations:decide", found.branchId).ok
    )
      return notFound();

    let note: string | null = null;
    let reason = "";
    if (decision.kind === "APPROVE") {
      note = decision.note?.trim() || null;
      if (note && (note.length > NOTE_MAX || /[\p{Cc}\p{Cf}]/u.test(note)))
        return invalid("Check the note.", [
          {
            path: "note",
            message: "Use plain text of at most 500 characters.",
          },
        ]);
    } else {
      try {
        reason = parseRejectionReason(decision.reason);
      } catch (error) {
        if (error instanceof DomainValidationError)
          return invalid(error.message, error.issues);
        throw error;
      }
      if (/[\p{Cc}\p{Cf}]/u.test(reason))
        return invalid("Check the reason.", [
          {
            path: "reason",
            message: "Use plain text without control characters.",
          },
        ]);
    }

    const result = await this.deps.unitOfWork.run<Plan>(async (context) => {
      const locked = await context.reservations.lockById(
        found.branchId,
        found.reservationId,
      );
      if (!locked.ok) return locked;
      const reservation = locked.value;
      if (!reservation) return notFound();
      const request = await context.cancellationRequests.findById(id);
      if (!request || request.reservationId !== reservation.id)
        return notFound();
      // Also refuses a request a staff action closed meanwhile (Q-96).
      if (request.status !== "OPEN")
        return invalidTransition(
          request.status,
          "This request has already been decided or closed.",
        );
      const now = this.deps.clock.now();

      if (decision.kind === "REJECT") {
        await context.cancellationRequests.transition({
          id,
          from: "OPEN",
          to: "REJECTED",
          at: now,
          decidedById: principal.id,
          decisionReason: reason,
        });
        await context.audit.append(
          auditEvent({
            occurredAt: now,
            actorType: "STAFF",
            actorId: principal.id,
            action: "cancellation-request.rejected",
            entityType: "CancellationRequest",
            entityId: id,
            branchId: reservation.branchId,
            reason,
            changes: { reservationId: reservation.id },
          }),
        );
        await context.messages.enqueue(reservation.branchId, reservation.id, {
          kind: "cancellation-request.rejected",
          reason,
        });
        return success({ kind: "DONE" });
      }

      const plan = planApproval({
        reservationStatus: reservation.status,
        paymentStatus: reservation.paymentStatus,
      });
      if (plan === "NOT_APPROVABLE")
        return invalidTransition(
          reservation.status,
          "This reservation can no longer be cancelled through a request.",
        );
      const approved = async (to: "COMPLETED" | "REFUND_PENDING") => {
        await context.cancellationRequests.transition({
          id,
          from: "OPEN",
          to: "APPROVED",
          at: now,
          decidedById: principal.id,
          decisionReason: null,
        });
        await context.cancellationRequests.transition({
          id,
          from: "APPROVED",
          to,
          at: now,
        });
        await context.audit.append(
          auditEvent({
            occurredAt: now,
            actorType: "STAFF",
            actorId: principal.id,
            action: "cancellation-request.approved",
            entityType: "CancellationRequest",
            entityId: id,
            branchId: reservation.branchId,
            reason: note,
            changes: {
              reservationId: reservation.id,
              requestedBy: request.requestedBy,
              plan: to === "COMPLETED" ? "CANCEL_NOW" : "REFUND_FIRST",
              noteProvided: note !== null,
            },
          }),
        );
      };

      if (plan === "CANCEL_NOW") {
        const current = reservation;
        const transition = ReservationStateMachine.transition(
          {
            ...current,
            allUnitsAssigned: reservation.lines.every(
              (line) => line.physicalRoomId !== null,
            ),
          },
          "CANCEL_APPROVED",
          localDateAt(now, reservation.branchTimeZone),
        );
        if (!transition.allowed)
          return invalidTransition(
            reservation.status,
            "This reservation cannot be cancelled.",
          );
        await approved("COMPLETED");
        const { stored, flagPmsUpdate } = await finishCancellation(
          context,
          reservation,
          principal,
          this.deps.ids,
          now,
        );
        await context.audit.append(
          auditEvent({
            occurredAt: now,
            actorType: "STAFF",
            actorId: principal.id,
            action: "reservation.cancelled",
            entityType: "Reservation",
            entityId: reservation.id,
            branchId: reservation.branchId,
            reason: note,
            changes: {
              reference: reservation.reference.value,
              reason: "GUEST_REQUEST",
              noteProvided: note !== null,
              couponReleased: reservation.couponId !== null,
              guestNotified: true,
              flagPmsUpdate,
              changeSeq: flagPmsUpdate ? stored.changeSeq : null,
            },
          }),
        );
        await context.messages.enqueue(reservation.branchId, reservation.id, {
          kind: "cancellation-request.approved",
        });
        return success({ kind: "DONE" });
      }

      // REFUND_FIRST: the booking stays confirmed until the gateway confirms.
      const payment = await context.payments.findPaidPayment(reservation.id);
      if (!payment)
        return invalidTransition(
          reservation.status,
          "No successful payment was found to refund.",
        );
      const attempt = await context.payments.startRefund(payment.id, now);
      await context.reservations.setPaymentStatus(
        reservation.branchId,
        reservation.id,
        "REFUND_PENDING",
        now,
      );
      await approved("REFUND_PENDING");
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
            requestId: id,
            trigger: "DECISION",
          },
        }),
      );
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "cancellation-request.approved",
        refundMinor: payment.amountMinor,
      });
      // Without a gateway transaction id nothing can be sent yet: the sweep
      // looks it up and sends the refund with this same key.
      if (!payment.providerTransactionId) return success({ kind: "DONE" });
      return success({
        kind: "REFUND",
        attempt,
        request: {
          paymentId: payment.id,
          providerTransactionId: payment.providerTransactionId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          idempotencyKey: refundAttemptKey(payment.id, attempt),
        },
      });
    });
    if (!result.ok) return result;
    if (result.value.kind === "REFUND")
      await this.deps.refunds.send(result.value.request, result.value.attempt);
    const final = await this.deps.reader.findById(id);
    if (!final) return notFound();
    return success({
      id: final.id,
      reservationId: final.reservationId,
      branchId: final.branchId,
      status: final.status,
      refundStarted: result.value.kind === "REFUND",
    });
  }
}

export type ListCancellationRequestsQuery = Readonly<{
  branchId?: string | undefined;
  status?: CancellationRequestStatus | undefined;
  page: number;
  pageSize: number;
}>;

/** S17: the cancellation queue of the branches the staff member may decide for. */
export class ListCancellationRequests {
  constructor(
    private readonly reader: Pick<CancellationRequestReader, "list">,
  ) {}

  async execute(
    staff: StaffPrincipal | null,
    query: ListCancellationRequestsQuery,
  ): Promise<
    Result<{
      items: readonly CancellationRequestListItem[];
      total: number;
      page: number;
      pageSize: number;
    }>
  > {
    const access = query.branchId
      ? authorizeBranch(staff, "cancellations:decide", query.branchId)
      : authorize(staff, "cancellations:decide");
    if (!access.ok) return access;
    const scope: BranchScope = query.branchId
      ? [query.branchId]
      : branchScope(access.value);
    if (scope !== "ALL" && scope.length === 0)
      return success({
        items: [],
        total: 0,
        page: query.page,
        pageSize: query.pageSize,
      });
    return success(await this.reader.list(scope, query));
  }
}
