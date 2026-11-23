// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CheckoutFailure,
  CheckoutInput,
  PaymentCallbackInput,
  PaymentGateway,
  RefundResult,
} from "@/application/payments";
import { FakePaymentGateway } from "@/infrastructure/payments/fake/fake-payment-gateway";

const origin = "http://payment.example.test";
const secret = "example-signing-secret-for-the-contract-suite";
const now = new Date("2026-11-23T12:00:00Z");
const checkout: CheckoutInput = {
  paymentId: "payment-1",
  amountMinor: 12_501,
  currency: "USD",
  reference: "RR-TEST-1",
  customer: { name: "Private Guest Name", email: "private@example.test" },
  expiresAt: new Date("2026-11-23T12:13:00Z"),
  returnUrl: `${origin}/new-cairo/booking-status`,
};

// Each provider fixture drives its sandbox or stubbed transport, while every
// assertion below uses the same application port (AC-9, AC-10, T-ADP).
interface Fixture {
  gateway: PaymentGateway;
  checkoutFailure(code: CheckoutFailure): void;
  refundOutcome(status: RefundResult["status"]): void;
  callback(
    outcome: "declined" | "paid" | "refund-succeeded" | "refund-failed",
  ): PaymentCallbackInput;
  expire(): void;
}

const adapters: { name: string; create(): Fixture }[] = [
  {
    name: "fake",
    create() {
      let time = now;
      const fake = new FakePaymentGateway({
        origin,
        secret,
        clock: { now: () => time },
      });
      return {
        gateway: fake,
        checkoutFailure: (code) =>
          fake.setCheckoutFailure(checkout.paymentId, code),
        refundOutcome: (status) =>
          fake.setRefundOutcome(checkout.paymentId, status),
        callback(outcome) {
          const action = {
            declined: "decline",
            paid: "pay",
            "refund-succeeded": "complete-refund",
            "refund-failed": "fail-refund",
          } as const;
          const simulation = fake.simulate(checkout.paymentId, action[outcome]);
          if (simulation.status !== "callback")
            throw new Error("The scenario did not produce a callback.");
          return fake.callbackFor(simulation.event);
        },
        expire: () => {
          time = checkout.expiresAt;
        },
      };
    },
  },
];

async function capturePayment(fixture: Fixture) {
  await fixture.gateway.createCheckout(checkout);
  const event = await fixture.gateway.verifyCallback(fixture.callback("paid"));
  if ("rejected" in event || !event.providerTransactionId)
    throw new Error("Expected a verified capture with a transaction id.");
  return {
    paymentId: checkout.paymentId,
    providerTransactionId: event.providerTransactionId,
    amountMinor: checkout.amountMinor,
    currency: checkout.currency,
    idempotencyKey: "payment-1:1",
  };
}

afterEach(() => vi.restoreAllMocks());

describe.each(adapters)("PaymentGateway contract ($name)", ({ create }) => {
  it("opens one hosted checkout per payment ID when the request is retried", async () => {
    const { gateway } = create();
    const first = await gateway.createCheckout(checkout);
    expect(first).toMatchObject({
      ok: true,
      checkoutUrl: expect.stringMatching(/^https?:\/\//),
    });
    expect(await gateway.createCheckout(checkout)).toEqual(first);
    const independent = await gateway.createCheckout({
      ...checkout,
      paymentId: "payment-2",
    });
    expect(independent).not.toEqual(first);
  });

  it.each(["PROVIDER_REJECTED", "UNAVAILABLE"] as const)(
    "maps a %s checkout failure without returning or logging private data",
    async (code) => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (method) => vi.spyOn(console, method).mockImplementation(() => {}),
      );
      const fixture = create();
      fixture.checkoutFailure(code);
      expect(await fixture.gateway.createCheckout(checkout)).toEqual({
        ok: false,
        code,
      });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    },
  );

  it("preserves minor units and currency and reports stable event identities", async () => {
    const fixture = create();
    const { gateway } = fixture;
    await gateway.createCheckout(checkout);
    const declined = await gateway.verifyCallback(fixture.callback("declined"));
    expect(declined).toMatchObject({
      kind: "TRANSACTION",
      outcome: "DECLINED",
    });
    const callback = fixture.callback("paid");
    const event = await gateway.verifyCallback(callback);
    expect(event).toMatchObject({
      kind: "TRANSACTION",
      outcome: "SUCCEEDED",
      paymentId: checkout.paymentId,
      providerEventId: expect.stringMatching(/\S/),
      amountMinor: 12_501,
      currency: "USD",
    });
    expect(await gateway.verifyCallback(callback)).toEqual(event);
    expect(await gateway.verifyCallback(fixture.callback("paid"))).toEqual(
      event,
    );
    expect(
      await gateway.getTransaction({ paymentId: checkout.paymentId }),
    ).toEqual(event);
    expect(JSON.stringify(event)).not.toContain(checkout.customer.email);
    expect(JSON.stringify(event)).not.toContain(checkout.customer.name);
    expect(JSON.stringify(event)).not.toContain(secret);
  });

  it("rejects missing or altered callback signatures and bodies generically", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const fixture = create();
    await fixture.gateway.createCheckout(checkout);
    const callback = fixture.callback("paid");
    const altered = new Uint8Array(callback.rawBody.length + 1);
    altered.set(callback.rawBody);
    altered[altered.length - 1] = 32; // The parsed data would still be identical.
    expect(
      await fixture.gateway.verifyCallback({ ...callback, rawBody: altered }),
    ).toEqual({ rejected: true });
    expect(
      await fixture.gateway.verifyCallback({
        ...callback,
        headers: new Headers(),
      }),
    ).toEqual({ rejected: true });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("reports a closed session at expiry and preserves the existing checkout URL", async () => {
    const fixture = create();
    const first = await fixture.gateway.createCheckout(checkout);
    fixture.expire();
    expect(
      await fixture.gateway.getTransaction({ paymentId: checkout.paymentId }),
    ).toMatchObject({ kind: "TRANSACTION", outcome: "SESSION_CLOSED" });
    expect(await fixture.gateway.createCheckout(checkout)).toEqual(first);
  });

  it("returns a captured payment by lookup when no callback was processed", async () => {
    const fixture = create();
    await fixture.gateway.createCheckout(checkout);
    const callback = fixture.callback("paid");
    fixture.expire();
    expect(
      await fixture.gateway.getTransaction({ paymentId: checkout.paymentId }),
    ).toEqual(await fixture.gateway.verifyCallback(callback));
    expect(await fixture.gateway.getTransaction({ paymentId: "missing" })).toBe(
      "NOT_FOUND",
    );
  });

  it("replays one refund attempt and makes a failed attempt retryable with a new key", async () => {
    const fixture = create();
    const refund = await capturePayment(fixture);
    fixture.refundOutcome("FAILED");
    const failed = await fixture.gateway.refund(refund);
    expect(failed.status).toBe("FAILED");
    expect(await fixture.gateway.refund(refund)).toEqual(failed);
    const retry = { ...refund, idempotencyKey: "payment-1:2" };
    const succeeded = await fixture.gateway.refund(retry);
    expect(succeeded.status).toBe("SUCCEEDED");
    expect(await fixture.gateway.refund(retry)).toEqual(succeeded);
    expect(await fixture.gateway.refund(refund)).toEqual(failed);
  });

  it("returns a stable pending refund and reports its eventual success", async () => {
    const fixture = create();
    const refund = await capturePayment(fixture);
    fixture.refundOutcome("PENDING");
    const pending = await fixture.gateway.refund(refund);
    expect(pending.status).toBe("PENDING");
    expect(await fixture.gateway.refund(refund)).toEqual(pending);
    const event = await fixture.gateway.verifyCallback(
      fixture.callback("refund-succeeded"),
    );
    expect(event).toMatchObject({
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: refund.idempotencyKey,
      amountMinor: checkout.amountMinor,
      currency: checkout.currency,
    });
    expect(
      await fixture.gateway.getTransaction({ paymentId: checkout.paymentId }),
    ).toEqual(event);
    expect(await fixture.gateway.refund(refund)).toMatchObject({
      ...pending,
      status: "SUCCEEDED",
    });
  });

  it("keeps a delayed failure tied to its original refund attempt after a retry starts", async () => {
    const fixture = create();
    const refund = await capturePayment(fixture);
    fixture.refundOutcome("FAILED");
    expect((await fixture.gateway.refund(refund)).status).toBe("FAILED");
    const delayed = fixture.callback("refund-failed");
    const firstResult = await fixture.gateway.getTransaction({
      paymentId: refund.paymentId,
    });

    const retry = { ...refund, idempotencyKey: "payment-1:2" };
    fixture.refundOutcome("PENDING");
    const pending = await fixture.gateway.refund(retry);
    expect(pending.status).toBe("PENDING");
    const stale = await fixture.gateway.verifyCallback(delayed);
    expect(stale).toEqual(firstResult);
    expect(stale).toMatchObject({
      kind: "REFUND",
      outcome: "REFUND_FAILED",
      refundAttemptKey: refund.idempotencyKey,
      providerTransactionId: refund.providerTransactionId,
    });
    expect(await fixture.gateway.refund(retry)).toEqual(pending);

    const completed = await fixture.gateway.verifyCallback(
      fixture.callback("refund-succeeded"),
    );
    expect(completed).toMatchObject({
      kind: "REFUND",
      outcome: "REFUND_SUCCEEDED",
      refundAttemptKey: retry.idempotencyKey,
      providerTransactionId: refund.providerTransactionId,
    });
    expect(
      await fixture.gateway.getTransaction({ paymentId: refund.paymentId }),
    ).toEqual(completed);
  });

  it("rejects refunds with a different transaction, amount, or currency", async () => {
    const fixture = create();
    const refund = await capturePayment(fixture);
    for (const changes of [
      { providerTransactionId: "other-transaction" },
      { amountMinor: refund.amountMinor - 1 },
      { currency: "EUR" },
    ]) {
      expect(await fixture.gateway.refund({ ...refund, ...changes })).toEqual({
        status: "FAILED",
      });
    }
    expect(await fixture.gateway.refund(refund)).toMatchObject({
      status: "SUCCEEDED",
    });
  });
});

describe("fake payment callback format", () => {
  const event = {
    providerEventId: "8cab8514-dc06-4f63-9844-f9db9cad12a6",
    paymentId: checkout.paymentId,
    providerTransactionId: "471dc4f9-a71f-46c4-b9e4-5edc9ab90259",
    amountMinor: checkout.amountMinor,
    currency: checkout.currency,
    kind: "TRANSACTION",
    outcome: "SUCCEEDED",
  };
  const encode = (payload: unknown) =>
    new TextEncoder().encode(JSON.stringify(payload));
  const refund = { ...event, kind: "REFUND", outcome: "REFUND_SUCCEEDED" };

  it.each([
    ["invalid UTF-8", Uint8Array.of(0xff)],
    ["invalid JSON", new TextEncoder().encode("{")],
    [
      "incompatible kind and outcome",
      encode({ ...event, kind: "REFUND", refundAttemptKey: "payment-1:1" }),
    ],
    ["unexpected fields", encode({ ...event, customer: checkout.customer })],
    ["missing refund attempt key", encode(refund)],
    ["empty refund attempt key", encode({ ...refund, refundAttemptKey: "" })],
  ] as const)(
    "rejects authentic callbacks with %s generically",
    async (_, rawBody) => {
      const gateway = new FakePaymentGateway({
        origin,
        secret,
        clock: { now: () => now },
      });
      const signature = createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
      expect(
        await gateway.verifyCallback({
          rawBody,
          headers: new Headers({ "x-fake-payment-signature": signature }),
          url: new URL("/api/v1/payments/callback", origin),
        }),
      ).toEqual({ rejected: true });
    },
  );
});
