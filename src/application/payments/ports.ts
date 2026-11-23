export type CheckoutInput = Readonly<{
  paymentId: string;
  amountMinor: number;
  currency: string;
  reference: string;
  customer: Readonly<{ name: string; email: string }>;
  expiresAt: Date;
  returnUrl: string;
}>;

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
  /** A repeated call for one payment id returns the original checkout. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyCallback(input: PaymentCallbackInput): Promise<PaymentCallbackResult>;
  getTransaction(
    input: TransactionLookup,
  ): Promise<PaymentGatewayEvent | "NOT_FOUND">;
  /** The same key addresses the same refund attempt. */
  refund(input: RefundInput): Promise<RefundResult>;
}
