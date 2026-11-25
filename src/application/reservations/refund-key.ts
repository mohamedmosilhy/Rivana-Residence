/** The key that addresses one refund attempt: the same key is the same refund at the gateway. */
export const refundAttemptKey = (paymentId: string, attempt: number) =>
  `${paymentId}:refund:${attempt}`;
