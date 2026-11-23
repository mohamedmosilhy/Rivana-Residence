// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

import { POST } from "@/app/dev/fake-checkout/[paymentId]/submit/route";
import {
  developmentPaymentCheckout,
  paymentGateway,
} from "@/composition/payment-gateway";

const origin = "http://payment.example.test";
const secret = "example-secret-for-the-checkout-route-tests";
let paymentId: string;
const callbackPath = "/api/v1/payments/callback";

function checkoutLocation(result: string) {
  return `/dev/fake-checkout/${paymentId}?result=${result}`;
}

function submit(
  body: string,
  options: { id?: string; origin?: string; mediaType?: string } = {},
) {
  return POST(
    new Request(`${origin}/dev/fake-checkout/${paymentId}/submit`, {
      method: "POST",
      headers: {
        origin: options.origin ?? origin,
        "content-type":
          options.mediaType ?? "application/x-www-form-urlencoded",
      },
      body,
    }),
    { params: Promise.resolve({ paymentId: options.id ?? paymentId }) },
  );
}

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PAYMENT_PROVIDER", "fake");
  vi.stubEnv("PAYMENT_FAKE_SECRET", secret);
  vi.stubEnv("APP_URL", origin);
  paymentId = randomUUID();
  const gateway = paymentGateway()!;
  await gateway.createCheckout({
    paymentId,
    amountMinor: 12_501,
    currency: "USD",
    reference: "RR-TEST",
    customer: { name: "Private guest", email: "private@example.test" },
    expiresAt: new Date(Date.now() + 600_000),
    returnUrl: `${origin}/new-cairo`,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fake checkout submission (AC-9, AC-10)", () => {
  it("routes signed callbacks through the configured HTTP origin using server-owned amounts", async () => {
    const events: unknown[] = [];
    const delivery = vi.fn(async (target: URL, options: RequestInit) => {
      const request = new Request(target, options);
      expect(target.href).toBe(`${origin}${callbackPath}`);
      expect(options.redirect).toBe("error");
      expect(request.method).toBe("POST");
      const rawBody = new Uint8Array(await request.arrayBuffer());
      const event = await paymentGateway()!.verifyCallback({
        rawBody,
        headers: request.headers,
        url: target,
      });
      events.push(event);
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", delivery);

    expect(paymentGateway()).toBe(developmentPaymentCheckout());
    expect((await submit("action=decline")).headers.get("location")).toBe(
      checkoutLocation("sent"),
    );
    expect((await submit("action=pay")).headers.get("location")).toBe(
      checkoutLocation("sent"),
    );
    expect((await submit("action=pay")).status).toBe(303);
    expect(delivery).toHaveBeenCalledTimes(3);
    const declined = {
      paymentId,
      amountMinor: 12_501,
      currency: "USD",
      outcome: "DECLINED",
    };
    const succeeded = { ...declined, outcome: "SUCCEEDED" };
    expect(events).toMatchObject([declined, succeeded, succeeded]);
    expect(events[2]).toEqual(events[1]);
    expect(JSON.stringify(events)).not.toMatch(
      /private@example|Private guest|example-secret/,
    );
  });

  it.each([
    { action: "delay-success", result: "scheduled", deliver: true },
    { action: "lose-callback", result: "dropped", deliver: false },
  ])(
    "records a capture without sending HTTP when simulating $action",
    async ({ action, result, deliver }) => {
      const fetch = vi.fn(async () => new Response(null, { status: 200 }));
      vi.stubGlobal("fetch", fetch);
      expect((await submit(`action=${action}`)).headers.get("location")).toBe(
        checkoutLocation(result),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(
        await paymentGateway()!.getTransaction({ paymentId }),
      ).toMatchObject({
        outcome: "SUCCEEDED",
        amountMinor: 12_501,
        currency: "USD",
      });
      if (deliver) {
        expect(
          (await submit("action=deliver-delayed")).headers.get("location"),
        ).toBe(checkoutLocation("sent"));
        expect(fetch).toHaveBeenCalledOnce();
      }
    },
  );

  it("can retry a failed callback delivery with the original bytes", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("private upstream error"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const failure = await submit("action=pay");
    expect(failure.headers.get("location")).toBe(
      checkoutLocation("delivery-failed"),
    );
    expect(await failure.text()).toBe("");
    expect((await submit("action=pay")).headers.get("location")).toBe(
      checkoutLocation("sent"),
    );
    expect(fetch.mock.calls[1]?.[1]?.body).toEqual(
      fetch.mock.calls[0]?.[1]?.body,
    );
  });

  it.each([
    ["action=pay&amountMinor=1", 422],
    ["action=pay&currency=EUR", 422],
    ["action=pay&action=decline", 422],
    ["action=other", 422],
    ["action=pay&refundOutcome=other", 422],
    ["x".repeat(513), 413],
  ] as const)("refuses malformed form input", async (form, status) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await submit(form)).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects other origins, wrong content types, unknown checkout IDs, and production", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await submit("action=pay", { origin: "https://unrelated.example.test" }))
        .status,
    ).toBe(403);
    expect(
      (await submit("action=pay", { mediaType: "text/plain" })).status,
    ).toBe(415);
    expect((await submit("action=pay", { id: "missing" })).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    expect((await submit("action=pay")).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
