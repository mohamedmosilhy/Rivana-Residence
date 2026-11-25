import { guestWhatsAppAllowed } from "@/domain/guests";
import type { CouponRedemptionStore } from "@/application/coupons";
import type { InventoryGuardOperation } from "@/application/inventory";
import { InventoryGuard } from "@/application/inventory";
import type {
  BookingPaymentStore,
  CallbackPayment,
  PaymentCallbackStore,
  PaymentEventResult,
  PaymentGateway,
  PaymentGatewayEvent,
  PaymentCallbackInput,
} from "@/application/payments";
import type {
  HeldMessage,
  QueueReservationMessages,
} from "@/application/notifications";
import type { Clock, IdGenerator } from "@/application/shared/providers";
import { failure, success, type Result } from "@/application/shared/result";
import { auditEvent } from "@/domain/audit";
import { AvailabilityCalculator } from "@/domain/inventory";
import { decidePaymentSuccess, matchesPayment } from "@/domain/payments";

import {
  endBookingPaymentHold,
  expireListingPaymentHolds,
} from "./booking-payment-holds";
import type { CompleteRefund, CompleteRefundContext } from "./complete-refund";
import { manageTokenExpiry } from "./manage-token";
import type {
  BookingCrypto,
  ReservationRepository,
  ReservationUnitOfWork,
  StoredReservation,
} from "./ports";
import { refundAttemptKey } from "./refund-key";
import type { RefundDispatcher, RefundRequest } from "./send-refund";
import type { ReservationStorageContext } from "./storage-context";

export type ProcessPaymentCallbackContext = ReservationStorageContext &
  Readonly<{
    payments: BookingPaymentStore & PaymentCallbackStore;
    redemptions: Pick<
      CouponRedemptionStore,
      "lockByCode" | "release" | "reacquire"
    >;
    messages: Pick<
      QueueReservationMessages,
      "enqueue" | "discardHeld" | "heldMessages" | "releaseHeld"
    >;
    crypto: Pick<BookingCrypto, "generateToken" | "sha256">;
    cancellationRequests: CompleteRefundContext["cancellationRequests"];
  }>;

type Dependencies = Readonly<{
  unitOfWork: ReservationUnitOfWork<ProcessPaymentCallbackContext>;
  /** Pool reads that decide which lock path to take. Nothing is trusted from them. */
  reads: Readonly<{
    payments: Pick<PaymentCallbackStore, "findPayment">;
    reservations: Pick<ReservationRepository, "findById">;
  }>;
  /** Absent when the deployment has no gateway: every callback is then refused. */
  gateway?: Pick<PaymentGateway, "verifyCallback">;
  /** Finishes refund results (callbacks and lookups). Absent: they are recorded and ignored. */
  refunds?: Readonly<{
    complete: Pick<CompleteRefund, "applyLocked">;
    send: Pick<RefundDispatcher, "send">;
  }>;
  provider?: string;
  clock: Clock;
  ids: IdGenerator;
}>;

type Applied = Readonly<{
  result: PaymentEventResult;
  refund?: RefundRequest;
  /** The refund attempt `refund` belongs to, so the stamp cannot land on a newer attempt. */
  refundAttempt?: number;
  audit?: Parameters<typeof auditEvent>[0];
}>;
type Outcome = Readonly<{ redo: true }> | (Readonly<{ redo: false }> & Applied);

export { refundAttemptKey };

const REJECTED = () =>
  failure("WEBHOOK_SIGNATURE_INVALID", "The callback could not be verified.");

/**
 * P8. Verifies the callback, records the event once, and applies it.
 *
 * Lock rule (spec 0006 Decision 5): a path that cannot take inventory locks
 * only the reservation. A late success may take inventory, so it reads
 * unlocked, locks the listings, then the coupon, then the reservation, and
 * re-checks the state before writing. A listing lock never follows a
 * reservation lock. The refund call runs after commit.
 */
export class ProcessPaymentCallback {
  private readonly guard: InventoryGuard<ProcessPaymentCallbackContext>;

  constructor(private readonly deps: Dependencies) {
    this.guard = new InventoryGuard(deps.unitOfWork);
  }

  async execute(
    input: PaymentCallbackInput,
  ): Promise<Result<Readonly<{ recorded: true }>>> {
    const { gateway } = this.deps;
    if (!gateway) return REJECTED();
    let event: Awaited<ReturnType<PaymentGateway["verifyCallback"]>>;
    try {
      event = await gateway.verifyCallback(input);
    } catch {
      return REJECTED();
    }
    if ("rejected" in event) return REJECTED();
    const handled = await this.applyVerifiedEvent(event);
    return handled.ok ? success({ recorded: true }) : handled;
  }

  /**
   * Applies an event the gateway already authenticated: a verified callback,
   * or the answer to `getTransaction` (reconciliation). Both take the same
   * locks, checks and idempotency by `providerEventId`.
   */
  async applyVerifiedEvent(event: PaymentGatewayEvent): Promise<Result<void>> {
    const { reads, provider } = this.deps;
    // A verified event that cannot fit the event table is an adapter fault.
    // Refuse it like an unverifiable one rather than fail and be retried forever.
    if (event.providerEventId.length > 120 || event.paymentId.length > 128)
      return REJECTED();
    const payment = await reads.payments.findPayment(event.paymentId);
    if (!payment || payment.provider !== provider)
      return this.recordOnly(event, null, "IGNORED_UNKNOWN");
    if (!matchesPayment(payment, event))
      return this.recordOnly(event, payment.id, "IGNORED_MISMATCH");
    if (event.kind === "REFUND") return this.applyRefundEvent(event, payment);

    const reservation = await reads.reservations.findById(
      payment.branchId,
      payment.reservationId,
    );
    if (!reservation)
      return this.recordOnly(event, payment.id, "IGNORED_UNKNOWN");

    let outcome: Result<Outcome> | null = null;
    if (
      !(
        event.outcome === "SUCCEEDED" && reservation.status === "PAYMENT_FAILED"
      )
    )
      outcome = await this.applyUnderReservationLock(event, payment);
    if (!outcome || (outcome.ok && outcome.value.redo))
      outcome = await this.applyUnderListingLocks(event, payment, reservation);
    if (!outcome.ok) return outcome;
    const applied = outcome.value as Extract<Outcome, { redo: false }>;
    if (applied.refund && applied.refundAttempt !== undefined)
      await this.deps.refunds?.send.send(applied.refund, applied.refundAttempt);
    return success(undefined);
  }

  /**
   * A verified refund result. Under the reservation lock it goes to
   * `CompleteRefund`, which acts only for the current attempt; an older
   * attempt's answer is recorded as ignored and acknowledged.
   */
  private applyRefundEvent(
    event: Extract<PaymentGatewayEvent, { kind: "REFUND" }>,
    payment: CallbackPayment,
  ): Promise<Result<void>> {
    const { refunds } = this.deps;
    if (!refunds) return this.recordOnly(event, payment.id, "IGNORED_STATE");
    return this.deps.unitOfWork.run<void>(async (context) => {
      const locked = await context.reservations.lockById(
        payment.branchId,
        payment.reservationId,
      );
      if (!locked.ok) return locked;
      if (!locked.value) throw new Error("A payment has no reservation.");
      if (
        (await context.payments.findEventResult(event.providerEventId)) ===
        "APPLIED"
      )
        return success(undefined);
      const done = await refunds.complete.applyLocked(context, locked.value, {
        paymentId: payment.id,
        attemptKey: event.refundAttemptKey,
        outcome: event.outcome === "REFUND_SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      });
      if (!done.ok) return done;
      await this.record(
        context,
        event,
        payment.id,
        done.value.applied ? "APPLIED" : "IGNORED_STATE",
      );
      return success(undefined);
    });
  }

  private recordOnly(
    event: PaymentGatewayEvent,
    paymentId: string | null,
    result: PaymentEventResult,
  ): Promise<Result<void>> {
    return this.deps.unitOfWork.run(async (context) => {
      if (
        (await context.payments.findEventResult(event.providerEventId)) ===
        "APPLIED"
      )
        return success(undefined);
      await this.record(context, event, paymentId, result);
      return success(undefined);
    });
  }

  private record(
    context: ProcessPaymentCallbackContext,
    event: PaymentGatewayEvent,
    paymentId: string | null,
    result: PaymentEventResult,
  ) {
    return context.payments.recordEvent({
      id: this.deps.ids.next(),
      providerEventId: event.providerEventId,
      paymentId,
      kind: event.kind,
      outcome: event.outcome,
      result,
      amountMinor:
        Number.isSafeInteger(event.amountMinor) &&
        Math.abs(event.amountMinor) <= 2_147_483_647
          ? event.amountMinor
          : null,
      currency: /^[A-Z]{3}$/.test(event.currency) ? event.currency : null,
      at: this.deps.clock.now(),
    });
  }

  private applyUnderReservationLock(
    event: PaymentGatewayEvent,
    first: CallbackPayment,
  ): Promise<Result<Outcome>> {
    return this.deps.unitOfWork.run<Outcome>(async (context) => {
      const locked = await context.reservations.lockById(
        first.branchId,
        first.reservationId,
      );
      if (!locked.ok) return locked;
      const reservation = locked.value;
      if (!reservation) throw new Error("A payment has no reservation.");
      // The hold ended after the unlocked read: this needs the listing locks.
      if (
        event.outcome === "SUCCEEDED" &&
        reservation.status === "PAYMENT_FAILED"
      )
        return success({ redo: true });
      const applied = await this.apply(context, event, reservation, false);
      if (!applied.ok) return applied;
      if (applied.value.audit)
        await context.audit.append(auditEvent(applied.value.audit));
      return success({ redo: false, ...applied.value });
    });
  }

  private applyUnderListingLocks(
    event: PaymentGatewayEvent,
    payment: CallbackPayment,
    read: StoredReservation,
  ): Promise<Result<Outcome>> {
    type State = StoredReservation;
    const operation: InventoryGuardOperation<
      ProcessPaymentCallbackContext,
      State,
      State,
      Outcome
    > = {
      branchId: payment.branchId,
      roomTypeIds: [...new Set(read.lines.map((line) => line.roomTypeId))],
      load: async (context) => {
        // Listings are held. Overdue holds of other bookings are released first,
        // so a late success is not refunded for a unit that is already free.
        const expired = await expireListingPaymentHolds(
          context,
          payment.branchId,
          [...new Set(read.lines.map((line) => line.roomTypeId))],
          this.deps.clock.now(),
        );
        if (!expired.ok) return expired;
        // The coupon comes before the reservation row.
        if (read.couponCode) {
          const coupon = await context.redemptions.lockByCode(read.couponCode);
          if (!coupon.ok) return coupon;
        }
        const locked = await context.reservations.lockById(
          payment.branchId,
          payment.reservationId,
        );
        if (!locked.ok) return locked;
        if (!locked.value) throw new Error("A payment has no reservation.");
        return success(locked.value);
      },
      validate: (state) => success(state),
      mutate: async (context, state) => {
        const applied = await this.apply(context, event, state, true);
        if (!applied.ok) return applied;
        return success({ redo: false, ...applied.value });
      },
      audit: async (context, _state, value) => {
        if (!value.redo && value.audit)
          await context.audit.append(auditEvent(value.audit));
      },
    };
    return this.guard.execute(operation);
  }

  /** Runs with the reservation row locked (and the listings, when `listingsLocked`). */
  private async apply(
    context: ProcessPaymentCallbackContext,
    event: PaymentGatewayEvent,
    reservation: StoredReservation,
    listingsLocked: boolean,
  ): Promise<Result<Applied>> {
    const now = this.deps.clock.now();
    const earlier = await context.payments.findEventResult(
      event.providerEventId,
    );
    if (earlier === "APPLIED") return success({ result: "APPLIED" });
    const payment = await context.payments.findPayment(event.paymentId);
    if (!payment) throw new Error("The payment disappeared.");
    const done = async (applied: Applied): Promise<Result<Applied>> => {
      await this.record(context, event, payment.id, applied.result);
      return success(applied);
    };
    const ignored = () => done({ result: "IGNORED_STATE" });
    if (event.kind !== "TRANSACTION") return ignored();

    const holding =
      payment.status === "INITIATED" &&
      reservation.status === "AWAITING_PAYMENT";
    if (event.outcome === "DECLINED")
      return holding ? done({ result: "APPLIED" }) : ignored();
    if (event.outcome === "SESSION_CLOSED") {
      if (!holding) return ignored();
      await endBookingPaymentHold(
        context,
        reservation,
        payment,
        "EXPIRED",
        now,
      );
      return done({ result: "APPLIED" });
    }

    let unitsFree = false;
    if (reservation.status === "PAYMENT_FAILED" && listingsLocked) {
      const checked = await this.unitsFree(context, reservation);
      if (!checked.ok) return checked;
      unitsFree = checked.value;
    }
    const decision = decidePaymentSuccess({
      reservationStatus: reservation.status,
      paymentStatus: payment.status,
      unitsFree,
    });
    if (decision === "IGNORE_DUPLICATE") {
      // A second success with another transaction id may be a double charge.
      // The first sight of that event alerts the branch; a retry does not.
      if (
        earlier === null &&
        event.providerTransactionId &&
        payment.providerTransactionId &&
        event.providerTransactionId !== payment.providerTransactionId
      ) {
        await context.messages.enqueue(reservation.branchId, reservation.id, {
          kind: "payment.duplicate-alert",
          amountMinor: payment.amountMinor,
        });
        await context.audit.append(
          auditEvent({
            occurredAt: now,
            actorType: "SYSTEM",
            actorId: null,
            action: "payment.double-charge-suspected",
            entityType: "Payment",
            entityId: payment.id,
            branchId: reservation.branchId,
            reason: null,
            changes: {
              reservationId: reservation.id,
              amountMinor: payment.amountMinor,
            },
          }),
        );
      }
      return ignored();
    }
    const from = payment.status as "INITIATED" | "EXPIRED" | "FAILED";
    const transactionId =
      event.providerTransactionId ?? payment.providerTransactionId ?? undefined;
    await context.payments.markSucceeded(payment.id, transactionId, now);

    if (decision === "REFUND_AUTOMATICALLY") {
      const attempt = await context.payments.startRefund(payment.id, now);
      await context.reservations.setPaymentStatus(
        reservation.branchId,
        reservation.id,
        "REFUND_PENDING",
        now,
      );
      const refundMinor = payment.amountMinor;
      // The held confirmations carry raw manage tokens and will never be released.
      await context.messages.discardHeld(reservation.id);
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "payment.auto-refunded",
        refundMinor,
      });
      await context.messages.enqueue(reservation.branchId, reservation.id, {
        kind: "payment.staff-alert",
        refundMinor,
      });
      return done({
        result: "APPLIED",
        ...(transactionId
          ? {
              refund: {
                paymentId: payment.id,
                providerTransactionId: transactionId,
                amountMinor: payment.amountMinor,
                currency: payment.currency,
                idempotencyKey: refundAttemptKey(payment.id, attempt),
              },
              refundAttempt: attempt,
            }
          : {}),
        audit: {
          occurredAt: now,
          actorType: "SYSTEM",
          actorId: null,
          action: "payment.auto-refund-pending",
          entityType: "Payment",
          entityId: payment.id,
          branchId: reservation.branchId,
          reason: null,
          changes: {
            reservationId: reservation.id,
            from,
            refundMinor,
            refundAttempt: attempt,
          },
        },
      });
    }

    const late = decision === "CONFIRM_LATE";
    await context.reservations.confirmPaid(
      reservation.branchId,
      reservation.id,
      now,
    );
    if (late && reservation.couponId)
      await context.redemptions.reacquire(reservation.id);
    await this.releaseConfirmation(context, reservation, now);
    return done({
      result: "APPLIED",
      audit: {
        occurredAt: now,
        actorType: "SYSTEM",
        actorId: null,
        action: "payment.succeeded",
        entityType: "Payment",
        entityId: payment.id,
        branchId: reservation.branchId,
        reason: null,
        changes: { reservationId: reservation.id, from, to: "SUCCEEDED", late },
      },
    });
  }

  /** Under the listing locks. The reservation's own units are not counted while it is `PAYMENT_FAILED`. */
  private async unitsFree(
    context: ProcessPaymentCallbackContext,
    reservation: StoredReservation,
  ): Promise<Result<boolean>> {
    const quantities = new Map<string, number>();
    for (const line of reservation.lines)
      quantities.set(
        line.roomTypeId,
        (quantities.get(line.roomTypeId) ?? 0) + 1,
      );
    const inventory = await context.inventoryReader.readNights({
      branchId: reservation.branchId,
      roomTypeIds: [...quantities.keys()],
      nights: Array.from(reservation.stay.nights()),
    });
    if (!inventory.ok) return inventory;
    for (const [roomTypeId, quantity] of quantities) {
      const check = AvailabilityCalculator.check({
        stay: reservation.stay,
        quantity,
        nights: inventory.value.filter(
          (record) => record.roomTypeId === roomTypeId,
        ),
      });
      if (!check.available) return success(false);
    }
    return success(true);
  }

  /**
   * Held confirmations are released only by the transaction that confirms.
   * They carry the address and link of booking time. If the guest changed the
   * email or the link was revoked or replaced meanwhile, or the rows are gone,
   * the old rows are dropped and a confirmation with a new link goes to the
   * current contact.
   */
  private async releaseConfirmation(
    context: ProcessPaymentCallbackContext,
    reservation: StoredReservation,
    now: Date,
  ) {
    const held = await context.messages.heldMessages(reservation.id);
    if (this.heldStillValid(context, held, reservation)) {
      await context.messages.releaseHeld(reservation.id);
      return;
    }
    await context.messages.discardHeld(reservation.id);
    const token = context.crypto.generateToken();
    await context.reservations.rotateManageToken(
      reservation,
      context.crypto.sha256(token),
      manageTokenExpiry(reservation.stay.checkOut),
      now,
    );
    await context.messages.enqueue(reservation.branchId, reservation.id, {
      kind: "reservation.confirmed",
      notifyGuest: true,
      manageToken: token,
    });
  }

  private heldStillValid(
    context: ProcessPaymentCallbackContext,
    held: readonly HeldMessage[],
    reservation: StoredReservation,
  ) {
    const guest = held.filter(
      (message) => message.kind === "reservation.confirmed",
    );
    if (guest.length === 0 || !reservation.manageTokenHash) return false;
    const recipients = (channel: string) =>
      guest.filter((message) => message.channel === channel);
    const email = recipients("EMAIL");
    const whatsapp = recipients("WHATSAPP");
    if (
      email.length !== (reservation.contact.email ? 1 : 0) ||
      // An email verified booking queues no WhatsApp (spec 0006 Decision 9).
      whatsapp.length !==
        (guestWhatsAppAllowed(
          reservation.contact.phone,
          reservation.verificationChannel,
        )
          ? 1
          : 0) ||
      (email[0] && email[0].recipient !== reservation.contact.email) ||
      (whatsapp[0] && whatsapp[0].recipient !== reservation.contact.phone)
    )
      return false;
    return guest.every((message) => {
      const link = message.payload.manageLink;
      if (!link) return false;
      try {
        const token = decodeURIComponent(new URL(link).hash.slice(3));
        return context.crypto.sha256(token) === reservation.manageTokenHash;
      } catch {
        return false;
      }
    });
  }
}
