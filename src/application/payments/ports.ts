import type { PaymentStatus } from "@/domain/shared/types";

export type CheckoutInput = Readonly<{
  paymentId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  customer: Readonly<{ name: string; email: string }>;
  expiresAt: Date;
  returnUrl: string;
}>;

/** PROVIDER_REJECTED is final for the payment ID. Ambiguous outcomes are UNAVAILABLE. */
export type CheckoutFailure = "PROVIDER_REJECTED" | "UNAVAILABLE";

export type CheckoutResult =
  | Readonly<{ ok: true; checkoutUrl: string; providerOrderId?: string }>
  | Readonly<{ ok: false; code: CheckoutFailure }>;

export type PaymentCallbackInput = Readonly<{
  rawBody: Uint8Array;
  headers: Headers;
  url: URL;
}>;

export type PaymentGatewayEvent = Readonly<{
  providerEventId: string;
  paymentId: string;
  providerTransactionId?: string;
  amountMinor: number;
  currency: string;
}> &
  (
    | Readonly<{
        kind: "TRANSACTION";
        outcome: "SUCCEEDED" | "DECLINED" | "SESSION_CLOSED";
      }>
    | Readonly<{
        kind: "REFUND";
        outcome: "REFUND_SUCCEEDED" | "REFUND_FAILED";
        /** The idempotency key used to request this refund attempt. */
        refundAttemptKey: string;
      }>
  );

export type PaymentCallbackResult =
  | PaymentGatewayEvent
  | Readonly<{ rejected: true }>;

export type TransactionLookup = Readonly<{
  paymentId: string;
  providerOrderId?: string;
  providerTransactionId?: string;
}>;

export type RefundInput = Readonly<{
  paymentId: string;
  providerTransactionId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}>;

export type RefundResult = Readonly<{
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  providerRefundId?: string;
}>;

export interface PaymentGateway {
  /**
   * Concurrent and retried calls for one payment ID share the same outcome.
   * Once a checkout exists, return it. Return PROVIDER_REJECTED only if no
   * call for that ID can create a checkout, including after a retry or restart.
   * Any uncertainty about the outcome for the ID returns UNAVAILABLE.
   */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyCallback(input: PaymentCallbackInput): Promise<PaymentCallbackResult>;
  getTransaction(
    input: TransactionLookup,
  ): Promise<PaymentGatewayEvent | "NOT_FOUND">;
  /** The same key addresses the same refund attempt. */
  refund(input: RefundInput): Promise<RefundResult>;
}

export type BookingPayment = Readonly<{
  id: string;
  reservationId: string;
  provider: string;
  amountMinor: number;
  currency: string;
  expiresAt: Date;
  checkoutUrl: string | null;
}>;

/** The caller holds the reservation lock for writes to an existing payment. */
export interface BookingPaymentStore {
  findInitiated(reservationId: string): Promise<BookingPayment | null>;
  insert(payment: Omit<BookingPayment, "checkoutUrl">, at: Date): Promise<void>;
  saveCheckout(
    id: string,
    checkout: Extract<CheckoutResult, { ok: true }>,
  ): Promise<void>;
  end(id: string, status: "FAILED" | "EXPIRED", at: Date): Promise<void>;
}

export type PaymentEventResult =
  | "APPLIED"
  | "IGNORED_MISMATCH"
  | "IGNORED_UNKNOWN"
  | "IGNORED_STATE";

/** A payment with the reservation facts a callback needs. */
export type CallbackPayment = BookingPayment &
  Readonly<{
    branchId: string;
    status: PaymentStatus;
    providerTransactionId: string | null;
    refundAttempt: number;
  }>;

export type PaymentEventRecord = Readonly<{
  id: string;
  providerEventId: string;
  /** Null when no payment has the merchant reference (the row has no payment to point at). */
  paymentId: string | null;
  kind: PaymentGatewayEvent["kind"];
  outcome: PaymentGatewayEvent["outcome"];
  result: PaymentEventResult;
  amountMinor: number | null;
  currency: string | null;
  at: Date;
}>;

/**
 * Callback persistence. Events are recorded in the callback's own transaction.
 * The caller holds the reservation lock before reading or writing a payment.
 */
export interface PaymentCallbackStore {
  findPayment(id: string): Promise<CallbackPayment | null>;
  findEventResult(providerEventId: string): Promise<PaymentEventResult | null>;
  /** Inserts the event, or updates an earlier ignored row. An applied row is never changed. */
  recordEvent(event: PaymentEventRecord): Promise<void>;
  /** `INITIATED`, `EXPIRED`, or `FAILED` becomes `SUCCEEDED` (PY-4, PY-5). */
  markSucceeded(
    id: string,
    providerTransactionId: string | undefined,
    at: Date,
  ): Promise<void>;
  /** `SUCCEEDED` becomes `REFUND_PENDING` and the attempt number advances. Returns the new attempt. */
  startRefund(id: string, at: Date): Promise<number>;
  /**
   * Stamps the refund call. When `expectedAttempt` is given, only that attempt
   * is stamped, so a late result for an older attempt cannot mark a newer one.
   */
  markRefundRequested(
    id: string,
    at: Date,
    providerRefundId: string | undefined,
    expectedAttempt?: number,
  ): Promise<void>;
  /** Fills a missing gateway transaction id on a `REFUND_PENDING` payment (reconciliation). */
  setProviderTransactionId(
    id: string,
    providerTransactionId: string,
    at: Date,
  ): Promise<void>;
}

/** A payment row as the scheduled sweeps see it. */
export type SweepPayment = Readonly<{
  id: string;
  branchId: string;
  reservationId: string;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  amountMinor: number;
  currency: string;
  refundAttempt: number;
  expiresAt: Date;
  /** When the reservation last changed status (the hold end for `PAYMENT_FAILED`). */
  statusChangedAt: Date;
}>;

/**
 * Cross branch reads for the scheduled jobs (pool reads, no locks). Every row
 * is a candidate only: the job re-checks the state under the reservation lock
 * before writing. Results are bounded and ordered oldest first.
 */
export interface PaymentSweepStore {
  /** `id` is the reservation id. */
  findOverdueHolds(
    at: Date,
    limit: number,
    exclude: readonly string[],
  ): Promise<readonly Readonly<{ id: string; branchId: string }>[]>;
  /** `INITIATED` payments of `provider` whose gateway session ended by `at`. */
  findStaleInitiated(
    provider: string,
    at: Date,
    limit: number,
    exclude: readonly string[],
  ): Promise<readonly SweepPayment[]>;
  /** `REFUND_PENDING` with no refund call stamped and untouched since `olderThan`. */
  findUnsentRefunds(
    provider: string,
    olderThan: Date,
    limit: number,
    exclude: readonly string[],
  ): Promise<readonly SweepPayment[]>;
  /** Payments `EXPIRED` or `FAILED` past `expiresAt` whose reservation is `PAYMENT_FAILED` and still has held messages. */
  findHeldCleanup(
    provider: string,
    at: Date,
    limit: number,
    exclude: readonly string[],
  ): Promise<readonly SweepPayment[]>;
}
