import { afterAll, beforeEach, expect, it, vi } from "vitest";

import { signedCallback } from "@/infrastructure/payments/fake/callback";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import { callbackEvent } from "./support/payment-callback";
import {
  bookingBody,
  issueToken,
  phoneOf,
  seedBookable,
  websiteBooking,
} from "./support/website-booking";

vi.stubEnv("PAYMENT_PROVIDER", "fake");
vi.stubEnv("PAYMENT_FAKE_SECRET", "route-test-fake-secret-0123456789abcdef");
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: () => undefined,
  revalidateTag: () => undefined,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<object>()),
  connection: async () => undefined,
}));
vi.mock("@/composition/auth", () => ({
  resolveStaffFromHeaders: async () => null,
  throttleKeys: () => new HmacThrottleKeys("test-callback-hmac-secret"),
}));
const { POST } = await import("@/app/api/v1/payments/callback/route");
const client = createTestClient();
const url = new URL("http://localhost/api/v1/payments/callback");

beforeEach(() => resetDatabase(client));
afterAll(() => client.$disconnect());

async function booked() {
  await seedBookable(client, { units: 1 });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true },
  });
  const phone = phoneOf(1);
  const created = await websiteBooking(client, {
    checkout: {
      provider: "fake",
      gateway: {
        createCheckout: async () => ({
          ok: true,
          checkoutUrl: "https://gateway.example.test/checkout",
        }),
      },
      appUrl: "https://hotel.example",
    },
  }).execute(
    bookingBody(phone, await issueToken(client, phone), {
      paymentMethod: "ONLINE",
    }),
    "route-key",
  );
  if (!created.ok) throw new Error(created.error.code);
  return client.payment.findFirstOrThrow();
}

const post = (body: BodyInit, headers: HeadersInit = {}) =>
  POST(new Request(url, { method: "POST", headers, body }));

it("verifies, applies and acknowledges a callback without a session or CSRF token (AC-1, AC-2)", async () => {
  const payment = await booked();
  const event = callbackEvent(payment);
  const { rawBody, headers } = signedCallback(
    "route-test-fake-secret-0123456789abcdef",
    url,
    event,
  );
  const response = await post(rawBody as BodyInit, headers);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ received: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(
    await client.reservation.findUniqueOrThrow({
      where: { id: payment.reservationId },
    }),
  ).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
  // The same delivery again is acknowledged and changes nothing.
  expect((await post(rawBody as BodyInit, headers)).status).toBe(200);
  expect(await client.paymentEvent.count()).toBe(1);
});

it("logs no guest contact, token or event identifier for a callback", async () => {
  const payment = await booked();
  const event = callbackEvent(payment);
  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  const spies = (["log", "info", "warn", "error"] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation(capture),
  );
  const out = vi.spyOn(process.stdout, "write").mockImplementation(((
    chunk: unknown,
  ) => {
    capture(chunk);
    return true;
  }) as never);
  try {
    const { rawBody, headers } = signedCallback(
      "route-test-fake-secret-0123456789abcdef",
      url,
      event,
    );
    expect((await post(rawBody as BodyInit, headers)).status).toBe(200);
    expect(
      (
        await post(rawBody as BodyInit, {
          "x-fake-payment-signature": "0".repeat(64),
        })
      ).status,
    ).toBe(401);
  } finally {
    for (const spy of [...spies, out]) spy.mockRestore();
  }
  const text = lines.join("\n");
  expect(text).toContain("/api/v1/payments/callback");
  for (const secret of [
    "amina@example.test",
    phoneOf(1),
    event.providerEventId,
    event.providerTransactionId!,
    "x-fake-payment-signature",
  ])
    expect(text).not.toContain(secret);
});

it("answers 401 with no detail for a bad signature, and 413 past 64 KB", async () => {
  const payment = await booked();
  const event = callbackEvent(payment);
  const { rawBody } = signedCallback("a-different-secret", url, event);
  const forged = await post(rawBody as BodyInit, {
    "x-fake-payment-signature": "0".repeat(64),
  });
  expect(forged.status).toBe(401);
  const problem = await forged.json();
  expect(problem).toMatchObject({ code: "WEBHOOK_SIGNATURE_INVALID" });
  expect(JSON.stringify(problem)).not.toContain(payment.id);
  expect((await post("x".repeat(64 * 1024 + 1))).status).toBe(413);
  expect(await client.paymentEvent.count()).toBe(0);
  expect(
    await client.reservation.findUniqueOrThrow({
      where: { id: payment.reservationId },
    }),
  ).toMatchObject({ status: "AWAITING_PAYMENT" });
});
