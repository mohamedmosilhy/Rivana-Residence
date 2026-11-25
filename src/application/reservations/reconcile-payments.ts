import type { QueueReservationMessages } from "@/application/notifications";
import type {
  PaymentCallbackStore,
  PaymentGateway,
  PaymentGatewayEvent,
  PaymentSweepStore,
  SweepPayment,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";
import { success, type Result } from "@/application/shared/result";
import { matchesPayment } from "@/domain/payments";

import type { ProcessPaymentCallback } from "./process-payment-callback";
import type { RefundDispatcher } from "./send-refund";
import { refundAttemptKey } from "./refund-key";
import type { ReservationUnitOfWork, StoredReservation } from "./ports";
import type { ReservationStorageContext } from "./storage-context";
import { sweepInPages } from "./sweep-pages";

export type ReconcilePaymentsContext = ReservationStorageContext &
  Readonly<{
    payments: Pick<
      PaymentCallbackStore,
      "findPayment" | "markRefundRequested" | "setProviderTransactionId"
    >;
    messages: Pick<QueueReservationMessages, "discardHeld">;
  }>;

export type ReconcilePaymentsSummary = Readonly<{
  /** False when the deployment has no gateway: nothing was asked or changed. */
  gatewayReady: boolean;
  /** Gateway answers about a transaction that were processed through the callback code (the callback decides what, if anything, changed). */
  answered: number;
  /** Unsent refunds that were sent now. */
  refundsSent: number;
  /** Held confirmations deleted for payments known to be unpaid. */
  heldDeleted: number;
  /** Items the gateway could not answer yet, or that a later run will handle. */
  pending: number;
  failed: number;
}>;

/** Items read per page. A step reads up to `SWEEP_PAGES` pages per run. */
export const RECONCILE_BATCH = 50;
/** A refund sent this long ago without an answer is looked up at the gateway. */
export const SENT_REFUND_LOOKUP_AFTER_MS = 10 * 60_000;
/** A refund that stayed unsent this long is sent by the sweep (the server stopped after the commit). */
export const UNSENT_REFUND_AFTER_MS = 2 * 60_000;
/**
 * A "no success" answer deletes held confirmations only this long after the
 * payment's session deadline. A payment can still be settling just after it
 * (3-D Secure, a slow gateway inquiry), and a success found later is confirmed
 * or refunded only while the held rows exist.
 */
export const HELD_GRACE_MS = 30 * 60_000;
/** Held confirmations are dropped this long after the hold ended, without asking the gateway. */
export const HELD_FALLBACK_MS = 24 * 60 * 60_000;
/** One gateway call may not hold a run longer than this. A timeout counts as a failure and is retried next run. */
export const GATEWAY_TIMEOUT_MS = 15_000;

type Gateway = Pick<PaymentGateway, "getTransaction">;
type Lookup = PaymentGatewayEvent | "NOT_FOUND";
type Counts = {
  answered: number;
  refundsSent: number;
  heldDeleted: number;
  pending: number;
  failed: number;
};

/**
 * Scheduled reconciliation (spec 0006 Decision 6). Three bounded steps, each
 * idempotent and each item isolated:
 *
 * 1. A stale `INITIATED` session is asked about with `getTransaction`; an
 *    answer is applied by `ProcessPaymentCallback.applyVerifiedEvent`, so a
 *    lost callback takes exactly the P8 locks, checks and late success rules.
 * 2. An automatic refund that was never sent is sent with its original key,
 *    after looking up a missing transaction id.
 * 3. Held confirmations of an unpaid, ended payment are deleted once the
 *    gateway reports no success after the grace period (a reported success is
 *    applied instead), or 24 hours after the hold ended.
 *
 * 4. A refund that was sent more than 10 minutes ago and never answered is
 *    looked up with `getTransaction`; a refund answer goes through the same
 *    callback code (event record, attempt key check, `CompleteRefund`).
 */
export class ReconcilePayments {
  constructor(
    private readonly deps: Readonly<{
      unitOfWork: ReservationUnitOfWork<ReconcilePaymentsContext>;
      sweep: PaymentSweepStore;
      callback: Pick<ProcessPaymentCallback, "applyVerifiedEvent">;
      /** Sends a refund attempt and finishes the gateway's immediate answer. */
      refunds: Pick<RefundDispatcher, "send">;
      /** Absent when the deployment has no gateway. */
      gateway?: Gateway;
      provider?: string;
      clock: Clock;
      gatewayTimeoutMs?: number;
    }>,
  ) {}

  async run(): Promise<ReconcilePaymentsSummary> {
    const { gateway, provider } = this.deps;
    const counts: Counts = {
      answered: 0,
      refundsSent: 0,
      heldDeleted: 0,
      pending: 0,
      failed: 0,
    };
    if (!gateway || !provider) return { gatewayReady: false, ...counts };
    await this.recoverStaleSessions(gateway, provider, counts);
    await this.sendUnsentRefunds(gateway, provider, counts);
    await this.recoverSentRefunds(gateway, provider, counts);
    await this.cleanHeldMessages(gateway, provider, counts);
    return { gatewayReady: true, ...counts };
  }

  private timed<Value>(work: Promise<Value>): Promise<Value> {
    const ms = this.deps.gatewayTimeoutMs ?? GATEWAY_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("GATEWAY_TIMEOUT")), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
  }

  private lookup(gateway: Gateway, payment: SweepPayment): Promise<Lookup> {
    return this.timed(
      gateway.getTransaction({
        paymentId: payment.id,
        ...(payment.providerOrderId
          ? { providerOrderId: payment.providerOrderId }
          : {}),
      }),
    );
  }

  private recoverStaleSessions(
    gateway: Gateway,
    provider: string,
    counts: Counts,
  ) {
    const { sweep, callback, clock } = this.deps;
    return sweepInPages(
      RECONCILE_BATCH,
      (exclude) =>
        sweep.findStaleInitiated(
          provider,
          clock.now(),
          RECONCILE_BATCH,
          exclude,
        ),
      async (payment) => {
        try {
          const found = await this.lookup(gateway, payment);
          if (!isTransactionAnswer(found, payment)) {
            counts.pending += 1;
            return;
          }
          const applied = await callback.applyVerifiedEvent(found);
          if (applied.ok) counts.answered += 1;
          else counts.failed += 1;
        } catch {
          counts.failed += 1;
        }
      },
    );
  }

  private recoverSentRefunds(
    gateway: Gateway,
    provider: string,
    counts: Counts,
  ) {
    const { sweep, callback, clock } = this.deps;
    const sentBefore = new Date(
      clock.now().getTime() - SENT_REFUND_LOOKUP_AFTER_MS,
    );
    return sweepInPages(
      RECONCILE_BATCH,
      (exclude) =>
        sweep.findSentRefunds(provider, sentBefore, RECONCILE_BATCH, exclude),
      async (payment) => {
        try {
          const found = await this.lookup(gateway, payment);
          // Only a refund answer for this payment counts. A transaction answer
          // means the refund is still in progress at the gateway.
          if (
            found === "NOT_FOUND" ||
            found.kind !== "REFUND" ||
            found.paymentId !== payment.id
          ) {
            counts.pending += 1;
            return;
          }
          const applied = await callback.applyVerifiedEvent(found);
          if (!applied.ok) counts.failed += 1;
          // An answer about an earlier attempt is recorded and ignored: this
          // attempt is still waiting, so the item stays pending.
          else if (
            found.refundAttemptKey !==
            refundAttemptKey(payment.id, payment.refundAttempt)
          )
            counts.pending += 1;
          else counts.answered += 1;
        } catch {
          counts.failed += 1;
        }
      },
    );
  }

  private sendUnsentRefunds(
    gateway: Gateway,
    provider: string,
    counts: Counts,
  ) {
    const { sweep, clock } = this.deps;
    const olderThan = new Date(clock.now().getTime() - UNSENT_REFUND_AFTER_MS);
    return sweepInPages(
      RECONCILE_BATCH,
      (exclude) =>
        sweep.findUnsentRefunds(provider, olderThan, RECONCILE_BATCH, exclude),
      async (payment) => {
        try {
          const transactionId =
            payment.providerTransactionId ??
            (await this.findTransactionId(gateway, payment));
          if (!transactionId) {
            // The staff alert from the callback covers it until the gateway answers.
            counts.pending += 1;
            return;
          }
          // The same key as the first request: a refund sent twice stays one
          // refund. The dispatcher stamps the attempt and finishes an answer.
          const sent = await this.deps.refunds.send(
            {
              paymentId: payment.id,
              providerTransactionId: transactionId,
              amountMinor: payment.amountMinor,
              currency: payment.currency,
              idempotencyKey: refundAttemptKey(
                payment.id,
                payment.refundAttempt,
              ),
            },
            payment.refundAttempt,
          );
          if (sent) counts.refundsSent += 1;
          else counts.failed += 1;
        } catch {
          // A thrown or timed out call leaves `refundRequestedAt` null for the next run.
          counts.failed += 1;
        }
      },
    );
  }

  /**
   * The transaction id of a missing one: asks the gateway, accepts only a
   * successful answer for this payment with the same amount and currency, and
   * stores it. Returns null when the gateway cannot confirm one yet.
   */
  private async findTransactionId(
    gateway: Gateway,
    payment: SweepPayment,
  ): Promise<string | null> {
    const found = await this.lookup(gateway, payment);
    if (
      !isTransactionAnswer(found, payment) ||
      found.outcome !== "SUCCEEDED" ||
      !found.providerTransactionId ||
      !matchesPayment(payment, found)
    )
      return null;
    const transactionId = found.providerTransactionId;
    const stored = await this.lockedWrite(payment, async (context) => {
      const current = await context.payments.findPayment(payment.id);
      if (
        current?.status === "REFUND_PENDING" &&
        !current.providerTransactionId
      )
        await context.payments.setProviderTransactionId(
          payment.id,
          transactionId,
          this.deps.clock.now(),
        );
    });
    return stored ? transactionId : null;
  }

  private cleanHeldMessages(
    gateway: Gateway,
    provider: string,
    counts: Counts,
  ) {
    const { sweep, callback, clock } = this.deps;
    return sweepInPages(
      RECONCILE_BATCH,
      (exclude) =>
        sweep.findHeldCleanup(provider, clock.now(), RECONCILE_BATCH, exclude),
      async (payment) => {
        try {
          const now = clock.now().getTime();
          if (now - payment.statusChangedAt.getTime() < HELD_FALLBACK_MS) {
            const found = await this.lookup(gateway, payment);
            if (found !== "NOT_FOUND") {
              if (!isTransactionAnswer(found, payment)) {
                counts.pending += 1;
                return;
              }
              if (found.outcome === "SUCCEEDED") {
                // Paid after all: the late success path confirms or refunds.
                const applied = await callback.applyVerifiedEvent(found);
                if (applied.ok) counts.answered += 1;
                else counts.failed += 1;
                return;
              }
            }
            // No success yet, but the payment may still be settling. Keep the rows
            // (and keep asking) until the grace period after the session deadline.
            if (now - payment.expiresAt.getTime() < HELD_GRACE_MS) {
              counts.pending += 1;
              return;
            }
          }
          if (await this.discardHeld(payment)) counts.heldDeleted += 1;
          else counts.pending += 1;
        } catch {
          counts.failed += 1;
        }
      },
    );
  }

  /** Re-checks the state under the reservation lock. A success meanwhile keeps the rows. */
  private async discardHeld(payment: SweepPayment): Promise<boolean> {
    let deleted = false;
    const written = await this.lockedWrite(
      payment,
      async (context, reservation) => {
        const current = await context.payments.findPayment(payment.id);
        if (
          reservation?.status !== "PAYMENT_FAILED" ||
          (current?.status !== "EXPIRED" && current?.status !== "FAILED")
        )
          return;
        await context.messages.discardHeld(payment.reservationId);
        deleted = true;
      },
    );
    return written && deleted;
  }

  /** Runs `write` with the reservation row locked. False when the row is busy. */
  private async lockedWrite(
    payment: SweepPayment,
    write: (
      context: ReconcilePaymentsContext,
      reservation: StoredReservation | null,
    ) => Promise<void>,
  ): Promise<boolean> {
    const result: Result<void> = await this.deps.unitOfWork.run(
      async (context) => {
        const locked = await context.reservations.lockById(
          payment.branchId,
          payment.reservationId,
        );
        if (!locked.ok) return locked;
        await write(context, locked.value);
        return success(undefined);
      },
    );
    return result.ok;
  }
}

/**
 * A transaction answer about this payment. Anything else (nothing found, a
 * refund event, an answer for another payment id) is not acted on.
 */
function isTransactionAnswer(
  found: Lookup,
  payment: SweepPayment,
): found is Extract<PaymentGatewayEvent, { kind: "TRANSACTION" }> {
  return (
    found !== "NOT_FOUND" &&
    found.kind === "TRANSACTION" &&
    found.paymentId === payment.id
  );
}
