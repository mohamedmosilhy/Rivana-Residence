import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { HmacThrottleKeys } from "@/infrastructure/auth/throttle-keys";

import {
  createTestClient,
  resetDatabase,
  TEST_BRANCH_ID,
} from "../support/database";
import {
  bookingBody,
  configureWhatsApp,
  issueToken,
  NOW,
  phoneOf,
  seedBookable,
} from "./support/website-booking";

vi.stubEnv("PAYMENT_PROVIDER", "fake");
vi.stubEnv("WHATSAPP_PROVIDER", "fake");
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
  throttleKeys: () => new HmacThrottleKeys("test-online-booking-hmac-secret"),
}));
const { POST: book } = await import("@/app/api/v1/reservations/route");
const { POST: quote } = await import("@/app/api/v1/quotes/route");
const client = createTestClient();
const phone = phoneOf(1);
const key = "online-booking-route-key";

const send = (endpoint: "quotes" | "reservations", body: unknown) =>
  (endpoint === "quotes" ? quote : book)(
    new Request(`http://localhost/api/v1/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await resetDatabase(client);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());
afterAll(() => client.$disconnect());

it("exposes and enforces matching P6 and P7 payment methods (AC-1, AC-14)", async () => {
  await seedBookable(client, { units: 1 });
  await configureWhatsApp(client);
  const token = await issueToken(client, phone);
  const booking = bookingBody(phone, token, { paymentMethod: "ONLINE" });
  const { branchSlug, stay, lines, services } = booking;
  const quoteBody = { branchSlug, stay, lines, services };
  const assertQuote = async (paymentMethods: string[], input = quoteBody) => {
    const result = await send("quotes", input);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ paymentMethods });
  };
  await assertQuote(["PAY_AT_HOTEL"]);
  const switchedOff = await send("reservations", booking);
  expect(switchedOff.status).toBe(409);
  expect(await switchedOff.json()).toMatchObject({
    code: "PAYMENT_METHOD_UNAVAILABLE",
  });
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlinePaymentEnabled: true, onlineBookingEnabled: false },
  });
  await assertQuote([]);
  await client.branch.update({
    where: { id: TEST_BRANCH_ID },
    data: { onlineBookingEnabled: true },
  });
  await assertQuote(["PAY_AT_HOTEL", "ONLINE"]);
  await client.coupon.create({
    data: {
      id: "covers-accommodation",
      code: "FREE",
      kind: "PERCENT",
      percentBasisPoints: 10_000,
      allBranches: true,
    },
  });
  const freeQuote = { ...quoteBody, couponCode: "FREE" };
  await assertQuote(["PAY_AT_HOTEL"], freeQuote);
  const zero = await send("reservations", {
    ...booking,
    couponCode: "FREE",
    expectedTotal: { currency: "USD", amountMinor: 0 },
  });
  expect(zero.status).toBe(409);
  expect(await zero.json()).toMatchObject({
    code: "PAYMENT_METHOD_UNAVAILABLE",
  });
  expect(
    await client.phoneVerification.count({
      where: { consumedAt: { not: null } },
    }),
  ).toBe(0);
  expect(await client.reservation.count()).toBe(0);

  const created = await send("reservations", booking);
  expect(created.status).toBe(201);
  const response = await created.json();
  const payment = await client.payment.findFirstOrThrow();
  expect(response).toEqual({
    reference: expect.any(String),
    status: "AWAITING_PAYMENT",
    manageUrl: expect.stringMatching(/^\/reservations\/manage#t=[\w-]+$/),
    holdExpiresAt: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    checkoutUrl: payment.checkoutUrl,
  });
  expect(new URL(response.checkoutUrl).pathname).toBe(
    `/dev/fake-checkout/${payment.id}`,
  );
  await assertQuote([]);
  const replay = await send("reservations", booking);
  expect(replay.status).toBe(200);
  expect(await replay.json()).toEqual({
    reference: response.reference,
    status: "AWAITING_PAYMENT",
    checkoutUrl: response.checkoutUrl,
    manageUrl: null,
  });
  vi.setSystemTime(new Date(NOW.getTime() + 13 * 60_000));
  const noCheckout = await send("reservations", booking);
  expect(noCheckout.status).toBe(200);
  expect(await noCheckout.json()).toEqual({
    reference: response.reference,
    status: "AWAITING_PAYMENT",
    manageUrl: null,
  });
});
