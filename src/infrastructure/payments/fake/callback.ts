import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import type {
  PaymentCallbackInput,
  PaymentCallbackResult,
  PaymentGatewayEvent,
} from "@/application/payments";

const SIGNATURE_HEADER = "x-fake-payment-signature";

const eventFields = {
  providerEventId: z.uuid(),
  paymentId: z.string().min(1).max(128),
  providerTransactionId: z.uuid().optional(),
  amountMinor: z.int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
};
const eventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...eventFields,
    kind: z.literal("TRANSACTION"),
    outcome: z.enum(["SUCCEEDED", "DECLINED", "SESSION_CLOSED"]),
  }),
  z.strictObject({
    ...eventFields,
    kind: z.literal("REFUND"),
    outcome: z.enum(["REFUND_SUCCEEDED", "REFUND_FAILED"]),
    refundAttemptKey: z.string().min(1),
  }),
]);

function digest(secret: string, body: Uint8Array) {
  return createHmac("sha256", secret).update(body).digest();
}

export function signedCallback(
  secret: string,
  url: URL,
  event: PaymentGatewayEvent,
) {
  const rawBody = new TextEncoder().encode(JSON.stringify(event));
  const headers = new Headers({
    "content-type": "application/json",
    [SIGNATURE_HEADER]: digest(secret, rawBody).toString("hex"),
  });
  return { rawBody, headers, url };
}

export function verifySignedCallback(
  secret: string,
  { rawBody, headers }: PaymentCallbackInput,
): PaymentCallbackResult {
  const rejected = { rejected: true } as const;
  const signature = headers.get(SIGNATURE_HEADER);
  if (!signature || !/^[a-f0-9]{64}$/.test(signature)) return rejected;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), digest(secret, rawBody)))
    return rejected;

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
    const parsed = eventSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return rejected;
    const { providerTransactionId, ...event } = parsed.data;
    return providerTransactionId ? { ...event, providerTransactionId } : event;
  } catch {
    return rejected;
  }
}
