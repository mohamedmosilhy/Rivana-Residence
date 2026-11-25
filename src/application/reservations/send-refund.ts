import type {
  PaymentCallbackStore,
  PaymentGateway,
} from "@/application/payments";
import type { Clock } from "@/application/shared/providers";
import { success } from "@/application/shared/result";

import type { CompleteRefund } from "./complete-refund";
import type { ReservationUnitOfWork } from "./ports";

/** What the gateway is asked to refund. The key is `refundAttemptKey(payment id, attempt)`. */
export type RefundRequest = Readonly<{
  paymentId: string;
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}>;

export type SendRefundContext = Readonly<{
  payments: Pick<PaymentCallbackStore, "markRefundRequested">;
}>;

/** One gateway call may not hold a request open longer than this. */
export const REFUND_CALL_TIMEOUT_MS = 15_000;

/**
 * Sends one refund attempt after the transaction that started it committed
 * (no network call inside a transaction), then lets `CompleteRefund` finish it
 * when the gateway answers at once.
 *
 * - A thrown or timed out call, or a stamp that cannot be written, leaves
 *   `refundRequestedAt` empty: the reconcile job sends the same key again.
 * - `PENDING` stamps the attempt as sent and waits for the callback or the
 *   reconcile lookup.
 * - `SUCCEEDED` or `FAILED` stamps the attempt, then completes it (a `FAILED`
 *   answer makes the payment `REFUND_FAILED`).
 *
 * The stamp runs without the reservation lock on purpose: it is a conditional
 * update (still `REFUND_PENDING`, still unstamped, same attempt), so it can
 * never touch a newer attempt or a finished refund.
 */
export class RefundDispatcher {
  constructor(
    private readonly deps: Readonly<{
      /** Absent when the deployment has no gateway: nothing is sent. */
      gateway?: Pick<PaymentGateway, "refund">;
      unitOfWork: ReservationUnitOfWork<SendRefundContext>;
      complete: Pick<CompleteRefund, "execute">;
      clock: Clock;
      timeoutMs?: number;
    }>,
  ) {}

  /** True when the gateway answered the call (the attempt is stamped as sent). */
  async send(request: RefundRequest, attempt: number): Promise<boolean> {
    const { gateway, unitOfWork, complete, clock } = this.deps;
    if (!gateway) return false;
    let sent: Awaited<ReturnType<PaymentGateway["refund"]>>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      sent = await Promise.race([
        gateway.refund(request),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("GATEWAY_TIMEOUT")),
            this.deps.timeoutMs ?? REFUND_CALL_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
    try {
      await unitOfWork.run(async (context) => {
        await context.payments.markRefundRequested(
          request.paymentId,
          clock.now(),
          sent.providerRefundId,
          attempt,
        );
        return success(undefined);
      });
    } catch {
      // The decision already committed. The attempt stays unstamped and the
      // sweep sends the same key again, which the gateway treats as one refund.
      return false;
    }
    if (sent.status === "PENDING") return true;
    try {
      await complete.execute({
        paymentId: request.paymentId,
        attemptKey: request.idempotencyKey,
        outcome: sent.status,
        providerRefundId: sent.providerRefundId,
      });
    } catch {
      // The attempt stays pending; the refund callback or the lookup finishes it.
    }
    return true;
  }
}
